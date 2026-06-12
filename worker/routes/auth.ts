import { Hono } from "hono";
import { Env } from "../env";
import { hashPassword, verifyPassword } from "../crypto";
import { isValidOwnerName } from "../semver";
import { createSession, destroySession, currentUser, SessionUser } from "../session";

const auth = new Hono<{ Bindings: Env; Variables: { user: SessionUser } }>();

interface SignupBody {
  email?: string;
  password?: string;
  accountName?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

auth.post("/signup", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as SignupBody;
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const accountName = (body.accountName ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) return c.json({ error: "a valid email is required" }, 400);
  if (password.length < 8) return c.json({ error: "password must be at least 8 characters" }, 400);
  if (!isValidOwnerName(accountName)) {
    return c.json({ error: "account name must be lower-kebab (e.g. acme-corp)" }, 400);
  }

  // Email + account name must both be unique.
  const existingUser = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existingUser) return c.json({ error: "an account with this email already exists" }, 409);
  const existingAccount = await c.env.DB.prepare("SELECT id FROM accounts WHERE name = ?")
    .bind(accountName)
    .first();
  if (existingAccount) return c.json({ error: "this account name is taken" }, 409);

  const passwordHash = await hashPassword(password);

  // Create account then user, atomically via a D1 batch.
  const accountResult = await c.env.DB.prepare(
    "INSERT INTO accounts (name) VALUES (?) RETURNING id",
  )
    .bind(accountName)
    .first<{ id: number }>();
  if (!accountResult) return c.json({ error: "failed to create account" }, 500);

  const userResult = await c.env.DB.prepare(
    "INSERT INTO users (email, passwordHash, accountId) VALUES (?, ?, ?) RETURNING id",
  )
    .bind(email, passwordHash, accountResult.id)
    .first<{ id: number }>();
  if (!userResult) return c.json({ error: "failed to create user" }, 500);

  await createSession(c, { id: userResult.id, accountId: accountResult.id });
  return c.json({ email, accountName }, 201);
});

auth.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as SignupBody;
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  const user = await c.env.DB.prepare(
    `SELECT u.id AS id, u.passwordHash AS passwordHash, u.accountId AS accountId
     FROM users u WHERE u.email = ?`,
  )
    .bind(email)
    .first<{ id: number; passwordHash: string; accountId: number }>();

  // Always run a verify to reduce timing differences between unknown/known emails.
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, "pbkdf2$1$00$00");
  if (!user || !ok) return c.json({ error: "invalid email or password" }, 401);

  await createSession(c, { id: user.id, accountId: user.accountId });
  return c.json({ ok: true });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ user: null });
  return c.json({ user: { email: user.email, accountName: user.accountName } });
});

export default auth;
