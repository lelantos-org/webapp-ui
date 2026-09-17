import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { chunkFileNames, manualChunks } from "./vite/chunks";
import { lightTheme } from "./vite/plugins/light-theme";
import { linkHeaders } from "./vite/plugins/link-headers";
import { precompress } from "./vite/plugins/precompress";
import { tightenCsp } from "./vite/plugins/tighten-csp";
import { devProxy } from "./vite/proxy";
import { pwa } from "./vite/pwa";
import { alias, appDefine, fsAllow } from "./vite/shared";

/// COOP/COEP for dev and preview: the rayon prover needs `crossOriginIsolated` for SharedArrayBuffer.
const crossOriginIsolation: Record<string, string> = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  define: appDefine(),
  resolve: {
    preserveSymlinks: false,
    alias,
  },
  css: {
    postcss: { plugins: [lightTheme()] },
  },
  plugins: [
    react(),
    pwa(),
    tightenCsp(),
    linkHeaders(),
    // Must stay last.
    precompress(),
  ],
  optimizeDeps: {
    // Pre-bundling the SDK breaks its wasm `new URL` paths (silent slow poseidon fallback).
    exclude: ["@lelantos-org/sdk"],
    include: [
      "assert",
      // CJS deps of the excluded SDK, named through it so a linked `file:../sdk` resolves them.
      "@lelantos-org/sdk > bech32",
      ...Array.from({ length: 8 }, (_, i) => `@lelantos-org/sdk > poseidon-lite/poseidon${i + 1}`),
    ],
    esbuildOptions: {
      define: { global: "globalThis" },
    },
  },
  build: {
    target: "es2022",
    // Maps for symbolicating only; the Dockerfile strips them from the image.
    sourcemap: "hidden",
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000,
    commonjsOptions: {
      include: [/sdk/, /node_modules/],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: { manualChunks, chunkFileNames },
    },
  },
  // wasm-bindgen-rayon's worker helpers need ESM workers.
  worker: {
    format: "es",
  },
  server: {
    port: 5174,
    host: true,
    fs: {
      allow: fsAllow,
    },
    headers: crossOriginIsolation,
    proxy: devProxy(),
  },
  preview: {
    headers: crossOriginIsolation,
  },
});
