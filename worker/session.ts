import { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Env } from "./env";
import { hmacSha256Hex, randomToken, timingSafeEqual } from "./crypto";

const COOKIE_NAME = "ecx_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
  userId: number;
  email: string;
  accountId: number;
  accountName: string;
}

// All routers share this context shape so session helpers accept any of them.
type AppContext = Context<{ Bindings: Env; Variables: { user: SessionUser } }>;

// Issues a new session row + signed cookie for the given user.
export async function createSession(
  c: AppContext,
  user: { id: number; accountId: number },
): Promise<void> {
  const sessionId = randomToken(32);
  const expires = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await c.env.DB.prepare(
    "INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)",
  )
    .bind(sessionId, user.id, expires)
    .run();

  const sig = await hmacSha256Hex(c.env.SESSION_SECRET, sessionId);
  setCookie(c, COOKIE_NAME, `${sessionId}.${sig}`, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(c: AppContext): Promise<void> {
  const raw = getCookie(c, COOKIE_NAME);
  if (raw) {
    const [sessionId] = raw.split(".");
    if (sessionId) {
      await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
    }
  }
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

// Resolves the current user from the signed session cookie, or null.
export async function currentUser(c: AppContext): Promise<SessionUser | null> {
  const raw = getCookie(c, COOKIE_NAME);
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const sessionId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  const expected = await hmacSha256Hex(c.env.SESSION_SECRET, sessionId);
  if (!timingSafeEqual(sig, expected)) return null;

  const row = await c.env.DB.prepare(
    `SELECT u.id AS userId, u.email AS email, a.id AS accountId, a.name AS accountName
     FROM sessions s
     JOIN users u ON u.id = s.userId
     JOIN accounts a ON a.id = u.accountId
     WHERE s.id = ? AND s.expiresAt > datetime('now')`,
  )
    .bind(sessionId)
    .first<SessionUser>();
  return row ?? null;
}

// Hono middleware that requires an authenticated session; sets c.var.user.
export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: { user: SessionUser };
}> = async (c, next) => {
  const user = await currentUser(c);
  if (!user) {
    return c.json({ error: "authentication required" }, 401);
  }
  c.set("user", user);
  await next();
};
