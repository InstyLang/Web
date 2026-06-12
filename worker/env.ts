// Worker environment bindings (see wrangler.toml).
export interface Env {
  DB: D1Database;
  PACKAGES: R2Bucket;
  ASSETS: Fetcher;
  REGISTRY_NAME: string;
  MAX_PACKAGE_BYTES: string;
  SESSION_SECRET: string; // set via `wrangler secret put SESSION_SECRET`
}
