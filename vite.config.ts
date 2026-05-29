// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const apiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET || "http://localhost:8122";
const wsProxyTarget = process.env.VITE_DEV_WS_PROXY_TARGET || "ws://localhost:8122";
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || "questv3.diinooo.blog")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      allowedHosts,
      proxy: {
        "/api": apiProxyTarget,
        "/ws": {
          target: wsProxyTarget,
          ws: true,
        },
      },
    },
  },
});
