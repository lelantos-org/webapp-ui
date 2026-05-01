import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const r = (p: string) => fileURLToPath(new URL(`./node_modules/${p}`, import.meta.url));

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
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icons/*.png"],
      manifest: {
        name: "SilentSwap Wallet",
        short_name: "SilentSwap",
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
      devOptions: { enabled: true, type: "module" },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,wasm}"],
        // wasm-bindgen-rayon's workerHelpers.js is iife-only and ships
        // inside the SDK's `wasm/prover/pkg/snippets/` snippet dir.
        // Exclude from PWA precache so Rollup doesn't try to code-split it.
        globIgnores: ["**/wasm-bindgen-rayon-*/**", "**/pkg/snippets/**"],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api/, /^\/v1/],
      },
    }),
  ],
  optimizeDeps: {
    include: ["@lelantos-org/sdk", "assert"],
    esbuildOptions: {
      define: { global: "globalThis" },
    },
  },
  build: {
    target: "es2022",
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
          if (id.includes("zod")) return "vendor-forms";
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
