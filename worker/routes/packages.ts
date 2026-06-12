import { Hono } from "hono";
import { Env } from "../env";

const packages = new Hono<{ Bindings: Env }>();

// GET /api/packages/search?q=...&limit=...  — public package search.
packages.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10) || 20));

  const like = `%${q.replace(/[%_]/g, "")}%`;
  const stmt = q
    ? c.env.DB.prepare(
        `SELECT p.ownerName AS ownerName, p.packageName AS packageName, p.description AS description,
                COUNT(v.id) AS versionCount, MAX(v.publishedAt) AS lastPublishedAt
         FROM packages p
         LEFT JOIN packageVersions v ON v.packageId = p.id AND v.yanked = 0
         WHERE p.packageName LIKE ? OR p.ownerName LIKE ? OR p.description LIKE ?
         GROUP BY p.id
         ORDER BY versionCount DESC, p.packageName
         LIMIT ?`,
      ).bind(like, like, like, limit)
    : c.env.DB.prepare(
        `SELECT p.ownerName AS ownerName, p.packageName AS packageName, p.description AS description,
                COUNT(v.id) AS versionCount, MAX(v.publishedAt) AS lastPublishedAt
         FROM packages p
         LEFT JOIN packageVersions v ON v.packageId = p.id AND v.yanked = 0
         GROUP BY p.id
         ORDER BY MAX(v.publishedAt) DESC NULLS LAST, p.packageName
         LIMIT ?`,
      ).bind(limit);

  const result = await stmt.all();
  return c.json({ query: q, packages: result.results ?? [] });
});

// GET /api/packages/:owner/:name  — package detail + version list.
packages.get("/:owner/:name", async (c) => {
  const owner = c.req.param("owner");
  const name = c.req.param("name");

  const pkg = await c.env.DB.prepare(
    "SELECT id, ownerName, packageName, description, createdAt FROM packages WHERE ownerName = ? AND packageName = ?",
  )
    .bind(owner, name)
    .first<{ id: number; ownerName: string; packageName: string; description: string; createdAt: string }>();
  if (!pkg) return c.json({ error: "package not found" }, 404);

  const versions = await c.env.DB.prepare(
    `SELECT version, checksumSha256, sizeBytes, yanked, publishedAt, manifest
     FROM packageVersions WHERE packageId = ?
     ORDER BY major DESC, minor DESC, patch DESC, prerelease DESC`,
  )
    .bind(pkg.id)
    .all();

  return c.json({
    name: `@${pkg.ownerName}/${pkg.packageName}`,
    owner: pkg.ownerName,
    packageName: pkg.packageName,
    description: pkg.description,
    createdAt: pkg.createdAt,
    versions: (versions.results ?? []).map((v) => ({
      ...v,
      yanked: Boolean((v as { yanked: number }).yanked),
    })),
  });
});

export default packages;
