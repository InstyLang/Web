# Insty Registry — Web (Cloudflare edge)

Edge-native website + API for the Insty package registry. Runs entirely on
Cloudflare: a **Worker** (Hono) backed by **D1** (SQLite) and **R2** (tarball
storage), serving a **React SPA** as static assets from the same origin.

Features:

- **Signup / login / logout** — email + password (PBKDF2-SHA256), signed
  HttpOnly session cookies.
- **Dashboard** — your packages and publish tokens (create with optional
  expiry/scope, revoke).
- **Search & browse** — public package search and package detail pages.
- **CLI-compatible registry API** under `/v1/*`, byte-compatible with the
  `cloud` package manager (token auth via `sha256(token)`, multipart publish,
  semver `resolve`, tarball `source`). Publishing happens via the CLI using a
  token generated in the dashboard.

## Layout

```
worker/            Cloudflare Worker (Hono)
  index.ts         Route wiring + SPA asset fallback
  env.ts           Binding types (DB, PACKAGES, ASSETS, secrets)
  crypto.ts        PBKDF2 password hashing, sha256, HMAC cookie signing
  semver.ts        Validation + SemVer range matching (mirrors C++ core)
  session.ts       Session cookie issue/verify + requireAuth middleware
  routes/auth.ts   /api/auth/* (signup, login, logout, me)
  routes/dashboard.ts  /api/dashboard/* (tokens, packages) — auth required
  routes/packages.ts   /api/packages/* (search, detail) — public
  routes/v1.ts     /v1/* (CLI-compatible: resolve, source, versions, publish, yank)
src/               React SPA (Vite)
migrations/        D1 schema migrations
```

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars        # set a SESSION_SECRET for local dev

# Apply the schema to a local D1 database:
npm run db:migrate:local

# Terminal 1 — Worker API + D1/R2 emulation on :8787
npx wrangler dev

# Terminal 2 — Vite dev server (proxies /api and /v1 to :8787) on :5173
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` and `/v1/*` to
the local Worker so the SPA and API share an origin (cookies work).

## Deploy

```bash
# One-time: create the D1 database and R2 bucket, then set wrangler.toml's
# database_id to the value printed here.
npx wrangler d1 create ecliptix-registry
npx wrangler r2 bucket create ecliptix-packages

# Apply migrations to the remote D1 and set the session secret.
npm run db:migrate:remote
npx wrangler secret put SESSION_SECRET

# Build the SPA and deploy the Worker (serves dist/ as static assets).
npm run deploy
```

## Using the registry from the CLI

The `cloud` CLI defaults to the public registry at
`https://ecliptix-web.insty.workers.dev`. Generate a token in the web dashboard,
then:

```bash
# CLOUD_REGISTRY_URL only needed to override the default registry.
export CLOUD_TOKEN=insty_...
cloud publish
cloud install @owner/package
```

## Notes

- Passwords use PBKDF2-SHA256 (100k iterations) — the standard WebCrypto choice
  on Workers (bcrypt/scrypt aren't available natively).
- Tokens are stored as `sha256(token)` to match the C++ `cloud-server`, so the
  same CLI works against either backend.
- The SPA uses client-side routing; `wrangler.toml` sets
  `not_found_handling = "single-page-application"` so deep links resolve to
  `index.html`.
