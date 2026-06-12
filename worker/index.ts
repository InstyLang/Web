import { Hono } from "hono";
import { Env } from "./env";
import { SessionUser } from "./session";
import auth from "./routes/auth";
import dashboard from "./routes/dashboard";
import packages from "./routes/packages";
import v1 from "./routes/v1";

const app = new Hono<{ Bindings: Env; Variables: { user: SessionUser } }>();

app.get("/api/health", (c) => c.json({ ok: true, registry: c.env.REGISTRY_NAME }));

// Public + authenticated web API.
app.route("/api/auth", auth);
app.route("/api/dashboard", dashboard);
app.route("/api/packages", packages);

// CLI-compatible registry API (consumed by the `cloud` package manager).
app.route("/v1", v1);

// Unknown API/registry routes return JSON 404 (don't fall through to the SPA).
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
app.all("/v1/*", (c) => c.json({ error: "not found" }, 404));

// Everything else: serve the React SPA static assets (with SPA fallback to
// index.html, configured in wrangler.toml).
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
