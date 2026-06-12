import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the React SPA into dist/, which Wrangler serves as static assets.
// During `vite dev`, /api and /v1 are proxied to a local `wrangler dev` worker
// (run separately) so the SPA and API share an origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/v1": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
