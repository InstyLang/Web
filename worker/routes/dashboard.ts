import { Hono } from "hono";
import { Env } from "../env";
import { randomToken, sha256Hex } from "../crypto";
import { requireAuth, SessionUser } from "../session";

const dashboard = new Hono<{ Bindings: Env; Variables: { user: SessionUser } }>();

dashboard.use("*", requireAuth);

// List the signed-in account's tokens (never returns the raw secret).
dashboard.get("/tokens", async (c) => {
  const user = c.get("user");
  const result = await c.env.DB.prepare(
    `SELECT id, tokenPrefix, scope, name, expiresAt, revokedAt, createdAt
     FROM authTokens WHERE accountId = ? ORDER BY createdAt DESC`,
  )
    .bind(user.accountId)
    .all();
  return c.json({ tokens: result.results ?? [] });
});

interface CreateTokenBody {
  name?: string;
  scope?: string;
  expiresInDays?: number;
}

// Create a publish/admin token; the raw token is shown exactly once.
dashboard.post("/tokens", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as CreateTokenBody;
  const scope = body.scope === "admin" ? "admin" : "publish";
  const name = (body.name ?? "").slice(0, 80);

  const raw = `insty_${randomToken(24)}`;
  const tokenHash = await sha256Hex(raw);
  const tokenPrefix = raw.slice(0, 18);

  let expiresAt: string | null = null;
  if (typeof body.expiresInDays === "number" && body.expiresInDays > 0) {
    expiresAt = new Date(Date.now() + body.expiresInDays * 86400_000).toISOString();
  }

  await c.env.DB.prepare(
    `INSERT INTO authTokens (accountId, tokenHash, tokenPrefix, scope, name, expiresAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(user.accountId, tokenHash, tokenPrefix, scope, name, expiresAt)
    .run();

  return c.json({ token: raw, tokenPrefix, scope, name, expiresAt }, 201);
});

// Revoke one of the account's own tokens by id.
dashboard.delete("/tokens/:id", async (c) => {
  const user = c.get("user");
  const id = parseInt(c.req.param("id"), 10);
  const result = await c.env.DB.prepare(
    `UPDATE authTokens SET revokedAt = datetime('now')
     WHERE id = ? AND accountId = ? AND revokedAt IS NULL`,
  )
    .bind(id, user.accountId)
    .run();
  const changed = result.meta.changes ?? 0;
  if (changed === 0) return c.json({ error: "token not found or already revoked" }, 404);
  return c.json({ revoked: 1 });
});

// Packages owned by the signed-in account, with version counts.
dashboard.get("/packages", async (c) => {
  const user = c.get("user");
  const result = await c.env.DB.prepare(
    `SELECT p.ownerName AS ownerName, p.packageName AS packageName, p.description AS description,
            COUNT(v.id) AS versionCount, MAX(v.publishedAt) AS lastPublishedAt
     FROM packages p
     LEFT JOIN packageVersions v ON v.packageId = p.id
     WHERE p.ownerName = ?
     GROUP BY p.id
     ORDER BY p.packageName`,
  )
    .bind(user.accountName)
    .all();
  return c.json({ packages: result.results ?? [] });
});

export default dashboard;
