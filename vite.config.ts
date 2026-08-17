import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const r = (p: string) => fileURLToPath(new URL(`./node_modules/${p}`, import.meta.url));

// Extensions worth precompressing. The prover artifacts dominate: the ~49 MB
// `.zkey` gzips to ~14 MB and the ~3.9 MB circuit `.wasm` to ~1.2 MB. nginx
// would not gzip the zkey at all on its own (it is `application/octet-stream`,
// not in `gzip_types`), and gzipping 49 MB per request would be absurd anyway.
const COMPRESSIBLE = new Set([
  ".js",
  ".css",
  ".html",
  ".svg",
  ".json",
  ".wasm",
  ".zkey",
  ".webmanifest",
]);

// Below this, the gzip header costs more than the saving, and nginx's own
// `gzip_min_length` is 1024 — keep the two thresholds aligned.
const MIN_SIZE = 1024;

/// Emits `<file>.gz` next to every compressible build artifact, for nginx
/// `gzip_static`. `.map` files are deliberately skipped: `build.sourcemap` is
/// "hidden" and the Dockerfile strips them, so they never reach the image.
///
/// Runs in `closeBundle` with `enforce: "post"` and sits last in `plugins` so
/// it observes the files VitePWA writes in its own `closeBundle` (`sw.js`,
/// `workbox-*.js`) rather than racing them.
function precompress(): Plugin {
  let outDir = "dist";
  return {
    name: "precompress-gzip",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      let files = 0;
      let before = 0;
      let after = 0;

      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          const dot = entry.name.lastIndexOf(".");
          if (dot < 0 || !COMPRESSIBLE.has(entry.name.slice(dot))) continue;
          const size = statSync(full).size;
          if (size < MIN_SIZE) continue;
          const gz = gzipSync(readFileSync(full), { level: 9 });
          // A `.gz` larger than the source would make gzip_static a pessimism.
          if (gz.length >= size) continue;
          writeFileSync(`${full}.gz`, gz);
          files += 1;
          before += size;
          after += gz.length;
        }
      };

      walk(outDir);
      const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
      this.info(`precompressed ${files} files: ${mb(before)} MB -> ${mb(after)} MB gzip`);
    },
  };
}

export default defineConfig({
  resolve: {
    preserveSymlinks: false,
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // circomlibjs's `poseidon_*.js` reaches for `assert` at runtime.
      // Polyfill via the npm `assert` package so the browser bundle has
      // a real impl (Vite would otherwise externalize it as empty).
      assert: r("assert"),
    },
  },
  plugins: [
    react(),
    VitePWA({
      // "prompt", not "autoUpdate". Under autoUpdate the new worker calls
      // `skipWaiting()` and activates while the old page is still open, and
      // `cleanupOutdatedCaches` then deletes the precache that page is still
      // navigating against. The next `React.lazy` import fetches a hashed
      // chunk that no longer exists, and the app white-screens.
      //
      // Prompting keeps the new worker waiting until the user accepts, so the
      // old precache stays intact for the life of the old page — which also
      // makes the cache cleanup safe, since it only runs after the reload.
      registerType: "prompt",
      includeAssets: ["icon.svg", "icons/*.png"],
      manifest: {
        name: "Lelantos Wallet",
        short_name: "Lelantos",
        description: "Shielded MASP wallet",
        theme_color: "#ffffff",
        background_color: "#f5f5f4",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      // A real service worker in `npm run dev` is a recurring source of
      // stale-module confusion, and nothing here needs one to develop
      // against. Enable temporarily when working on the SW itself.
      devOptions: { enabled: false, type: "module" },
      workbox: {
        // No `wasm`: the circuit wasm is ~4 MB and only the prover reaches
        // for it, so precaching it makes a first visit pay for a proof the
        // user may never make. It is fetched and cached on first use instead.
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        globIgnores: [
          // wasm-bindgen-rayon's workerHelpers.js is iife-only and ships
          // inside the SDK's `wasm/prover/pkg/snippets/` snippet dir.
          // Exclude from PWA precache so Rollup doesn't try to code-split it.
          "**/wasm-bindgen-rayon-*/**",
          "**/pkg/snippets/**",
          // snarkjs is the fallback prover path; the wasm prover worker
          // handles every normal proof. Precaching it costs a first visit
          // ~444 KB for code that usually never runs.
          "**/snarkjs*",
        ],
        // `/fmd`, `/relayer`, `/explorer` and `/quote` are the real API
        // prefixes — see the dev proxy below. The former `/api` and `/v1`
        // entries matched no route this app ever issues.
        navigateFallbackDenylist: [/^\/fmd/, /^\/relayer/, /^\/explorer/, /^\/quote/],
      },
    }),
    // Last on purpose — see the note on `precompress`.
    precompress(),
  ],
  optimizeDeps: {
    include: ["@lelantos-org/sdk", "assert"],
    esbuildOptions: {
      define: { global: "globalThis" },
    },
  },
  build: {
    target: "es2022",
    // "hidden": maps are emitted but no `//# sourceMappingURL` comment is
    // appended, so browsers never request them. They exist for symbolicating a
    // production stack trace after the fact; the Dockerfile deletes them from
    // the runtime image so nothing ships to users.
    sourcemap: "hidden",
    // Vite gzips every chunk purely to print a size column. Real compression
    // now happens in `precompress`, so this is wasted CI time.
    reportCompressedSize: false,
    // The ~300 KB noteStore chunk (viem + idb + SDK stores) is deliberate and
    // route-lazy; 500 KB default just warns on it every build.
    chunkSizeWarningLimit: 1000,
    commonjsOptions: {
      include: [/sdk/, /node_modules/],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        // Split vendor code into stable, parallel-loadable chunks. Improves
        // cache hit rate across deploys (app churn doesn't invalidate vendor
        // bundles) and lets the browser fetch them concurrently.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-dom")) return "vendor-react";
          if (id.includes("/react/") || id.includes("react-router")) return "vendor-react";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("react-hook-form") || id.includes("@hookform")) return "vendor-forms";
          // zod must NOT share a chunk with react-hook-form. `config/env.ts`
          // and `config/chains.ts` import zod eagerly, so grouping them made
          // the entry chunk pull in react-hook-form + resolvers — code only
          // the lazy route components ever touch.
          if (id.includes("zod")) return "vendor-zod";
          if (id.includes("sonner")) return "vendor-ui";
          return undefined;
        },
      },
    },
  },
  // wasm-bindgen-rayon's `workerHelpers.js` (transitively imported by the
  // SDK's prover wasm pkg) self-spawns via `new Worker(new URL(...))` and
  // uses `import` statements internally. The default iife worker format
  // can't code-split modules, so force ESM workers for everything.
  worker: {
    format: "es",
  },
  server: {
    port: 5174,
    host: true,
    // SDK is linked from `../sdk` (file:../sdk). Vite's default fs.allow
    // is the project root only; widen to the monorepo so worker URLs that
    // resolve to `../sdk/dist/...` (e.g. `@lelantos-org/sdk/prover-worker`)
    // are servable in dev.
    fs: {
      allow: [".."],
    },
    // `wasm-bindgen-rayon` (used by the SDK's `WasmProver` via the worker
    // chunk) requires `SharedArrayBuffer`, which browsers gate behind
    // `crossOriginIsolated` (true only when these two headers are set).
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: {
      "/relayer": {
        target: "http://localhost:3003",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/relayer/, ""),
        // Stream SSE through without buffering. Default http-proxy stream
        // mode sometimes holds chunks until the body finishes — fatal for
        // /v1/intents/stream which never terminates. selfHandleResponse:
        // false (default) + this configure hook keep the chunks flowing.
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["x-accel-buffering"] = "no";
            // Drop content-length if any sneaks in — SSE is chunked.
            delete proxyRes.headers["content-length"];
          });
        },
      },
      "/fmd": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/fmd/, ""),
      },
      "/metaquoter": {
        target: "http://localhost:8081",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/metaquoter/, ""),
      },
      "/explorer": {
        target: "http://localhost:3002",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/explorer/, ""),
      },
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
