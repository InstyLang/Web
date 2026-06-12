import { Hono } from "hono";
import { Env } from "../env";
import { sha256Hex, sha256HexBytes } from "../crypto";
import {
  isValidOwnerName,
  isValidPackageName,
  parseSemVer,
  matchesRange,
  compareSemVer,
} from "../semver";

// CLI-compatible registry API. Mirrors the C++ cloud-server `/v1` routes so the
// existing `cloud` package manager works unchanged against the edge registry.
const v1 = new Hono<{ Bindings: Env }>();

function bearer(header: string | undefined): string {
  if (!header) return "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : "";
}

interface TokenIdentity {
  accountId: number;
  accountName: string;
  scope: string;
}

async function authenticate(env: Env, token: string): Promise<TokenIdentity | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT a.id AS accountId, a.name AS accountName, t.scope AS scope
     FROM authTokens t JOIN accounts a ON a.id = t.accountId
     WHERE t.tokenHash = ? AND t.revokedAt IS NULL
       AND (t.expiresAt IS NULL OR t.expiresAt > datetime('now'))`,
  )
    .bind(tokenHash)
    .first<TokenIdentity>();
  return row ?? null;
}

function versionJson(row: Record<string, unknown>) {
  return {
    name: `@${row.ownerName}/${row.packageName}`,
    version: row.version,
    yanked: Boolean(row.yanked),
    checksumSha256: row.checksumSha256,
    sizeBytes: Number(row.sizeBytes),
    publishedAt: row.publishedAt,
    manifest: JSON.parse(String(row.manifest)),
  };
}

// GET /v1/packages/:owner/:name/resolve?range=^1.0.0
v1.get("/packages/:owner/:name/resolve", async (c) => {
  const owner = c.req.param("owner").replace(/^@/, "");
  const name = c.req.param("name");
  const range = c.req.query("range") ?? "*";
  if (!isValidOwnerName(owner) || !isValidPackageName(name)) {
    return c.json({ error: "invalid owner or package name" }, 400);
  }

  const rows = await c.env.DB.prepare(
    `SELECT p.ownerName AS ownerName, p.packageName AS packageName, v.version AS version,
            v.checksumSha256 AS checksumSha256, v.sizeBytes AS sizeBytes, v.yanked AS yanked,
            v.publishedAt AS publishedAt, v.manifest AS manifest
     FROM packageVersions v JOIN packages p ON p.id = v.packageId
     WHERE p.ownerName = ? AND p.packageName = ? AND v.yanked = 0`,
  )
    .bind(owner, name)
    .all();

  let best: Record<string, unknown> | null = null;
  let bestSv = null;
  for (const row of rows.results ?? []) {
    const sv = parseSemVer(String((row as Record<string, unknown>).version));
    if (!sv || !matchesRange(sv, range)) continue;
    if (!best || (bestSv && compareSemVer(bestSv, sv) < 0)) {
      best = row as Record<string, unknown>;
      bestSv = sv;
    }
  }
  if (!best) return c.json({ error: "no version matches the requested range" }, 404);
  return c.json(versionJson(best));
});

// GET /v1/packages/:owner/:name/versions/:version/source  — streams the tarball.
v1.get("/packages/:owner/:name/versions/:version/source", async (c) => {
  const owner = c.req.param("owner").replace(/^@/, "");
  const name = c.req.param("name");
  const version = c.req.param("version");

  const row = await c.env.DB.prepare(
    `SELECT v.objectKey AS objectKey FROM packageVersions v
     JOIN packages p ON p.id = v.packageId
     WHERE p.ownerName = ? AND p.packageName = ? AND v.version = ?`,
  )
    .bind(owner, name, version)
    .first<{ objectKey: string }>();
  if (!row) return c.json({ error: "package version not found" }, 404);

  const object = await c.env.PACKAGES.get(row.objectKey);
  if (!object) return c.json({ error: "package source missing from storage" }, 404);
  return new Response(object.body, {
    headers: { "Content-Type": "application/gzip" },
  });
});

// GET /v1/packages/:owner/:name/versions  — list all versions.
v1.get("/packages/:owner/:name/versions", async (c) => {
  const owner = c.req.param("owner").replace(/^@/, "");
  const name = c.req.param("name");
  const rows = await c.env.DB.prepare(
    `SELECT p.ownerName AS ownerName, p.packageName AS packageName, v.version AS version,
            v.checksumSha256 AS checksumSha256, v.sizeBytes AS sizeBytes, v.yanked AS yanked,
            v.publishedAt AS publishedAt, v.manifest AS manifest
     FROM packageVersions v JOIN packages p ON p.id = v.packageId
     WHERE p.ownerName = ? AND p.packageName = ?
     ORDER BY v.major DESC, v.minor DESC, v.patch DESC`,
  )
    .bind(owner, name)
    .all();
  return c.json({
    name: `@${owner}/${name}`,
    versions: (rows.results ?? []).map((r) => versionJson(r as Record<string, unknown>)),
  });
});

interface ManifestShape {
  name?: string;
  dependencies?: Record<string, string>;
}

// POST /v1/packages/:owner/:name/versions/:version  — multipart publish.
v1.post("/packages/:owner/:name/versions/:version", async (c) => {
  const owner = c.req.param("owner").replace(/^@/, "");
  const name = c.req.param("name");
  const version = c.req.param("version");

  const identity = await authenticate(c.env, bearer(c.req.header("authorization")));
  if (!identity) return c.json({ error: "invalid bearer token" }, 401);
  if (identity.scope !== "publish" && identity.scope !== "admin") {
    return c.json({ error: "token scope cannot publish" }, 403);
  }
  // Owners may only publish under their own namespace (admins anywhere).
  if (identity.accountName !== owner && identity.scope !== "admin") {
    return c.json({ error: "cannot publish to another account's namespace" }, 403);
  }
  if (!parseSemVer(version)) return c.json({ error: "version must be SemVer" }, 400);

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "expected multipart form data" }, 400);
  const manifestRaw = form.get("manifest");
  const archive = form.get("archive");
  if (typeof manifestRaw !== "string" || !(archive instanceof File)) {
    return c.json({ error: "multipart upload requires manifest and archive fields" }, 400);
  }

  let manifest: ManifestShape;
  try {
    manifest = JSON.parse(manifestRaw) as ManifestShape;
  } catch {
    return c.json({ error: "manifest is not valid JSON" }, 400);
  }
  const expectedName = `@${owner}/${name}`;
  if (manifest.name !== expectedName) {
    return c.json({ error: `manifest name must be ${expectedName}` }, 400);
  }

  const maxBytes = parseInt(c.env.MAX_PACKAGE_BYTES, 10) || 50 * 1024 * 1024;
  const bytes = new Uint8Array(await archive.arrayBuffer());
  if (bytes.byteLength === 0) return c.json({ error: "archive is empty" }, 400);
  if (bytes.byteLength > maxBytes) return c.json({ error: "archive exceeds max size" }, 400);

  const checksum = await sha256HexBytes(bytes);
  const sv = parseSemVer(version)!;
  const objectKey = `${owner}/${name}/${version}/${checksum}.tar.gz`;

  // Ensure the package row exists (and capture its id).
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO packages (ownerName, packageName) VALUES (?, ?)",
  )
    .bind(owner, name)
    .run();
  const pkg = await c.env.DB.prepare(
    "SELECT id FROM packages WHERE ownerName = ? AND packageName = ?",
  )
    .bind(owner, name)
    .first<{ id: number }>();
  if (!pkg) return c.json({ error: "failed to create package" }, 500);

  // Reject duplicate versions.
  const existing = await c.env.DB.prepare(
    "SELECT id FROM packageVersions WHERE packageId = ? AND version = ?",
  )
    .bind(pkg.id, version)
    .first();
  if (existing) return c.json({ error: "version already published" }, 409);

  await c.env.PACKAGES.put(objectKey, bytes);

  await c.env.DB.prepare(
    `INSERT INTO packageVersions
       (packageId, version, major, minor, patch, prerelease, manifest, checksumSha256, sizeBytes, objectKey, publishedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      pkg.id,
      version,
      sv.major,
      sv.minor,
      sv.patch,
      sv.prerelease,
      manifestRaw,
      checksum,
      bytes.byteLength,
      objectKey,
      identity.accountId,
    )
    .run();

  return c.json({ name: expectedName, version, checksumSha256: checksum, sizeBytes: bytes.byteLength }, 201);
});

// POST /v1/packages/:owner/:name/versions/:version/yank
v1.post("/packages/:owner/:name/versions/:version/yank", async (c) => {
  const owner = c.req.param("owner").replace(/^@/, "");
  const name = c.req.param("name");
  const version = c.req.param("version");

  const identity = await authenticate(c.env, bearer(c.req.header("authorization")));
  if (!identity) return c.json({ error: "invalid bearer token" }, 401);
  if (identity.accountName !== owner && identity.scope !== "admin") {
    return c.json({ error: "cannot yank another account's package" }, 403);
  }

  const result = await c.env.DB.prepare(
    `UPDATE packageVersions SET yanked = 1
     WHERE version = ? AND packageId = (
       SELECT id FROM packages WHERE ownerName = ? AND packageName = ?
     )`,
  )
    .bind(version, owner, name)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "package version not found" }, 404);
  return c.json({ name: `@${owner}/${name}`, version, yanked: true });
});

export default v1;
