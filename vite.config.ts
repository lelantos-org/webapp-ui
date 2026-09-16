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

// The pieces live in `vite/`; this file is the assembly, and the place to read
// what the build does in order.

/// Response headers for `vite dev` and `vite preview`.
///
/// `wasm-bindgen-rayon` (used by the SDK's `WasmProver` via the worker
/// chunk) requires `SharedArrayBuffer`, which browsers gate behind
/// `crossOriginIsolated` (true only when these two headers are set).
///
/// The production image sets the same pair in `security-headers.conf`.
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
    // Repeats the light palette under `prefers-color-scheme`, so `tokens.css`
    // writes it once. Runs in dev and build alike.
    postcss: { plugins: [lightTheme()] },
  },
  plugins: [
    react(),
    pwa(),
    tightenCsp(),
    linkHeaders(),
    // Last on purpose — see the note on `precompress`.
    precompress(),
  ],
  optimizeDeps: {
    // The SDK is served unbundled in dev. Pre-bundling it pulled the three
    // wasm-pack glue modules (`#wasm/jubjub`, `#wasm/poseidon`, `#wasm/prover`)
    // into `node_modules/.vite/deps/`, and esbuild copies their closing
    // `new URL('<crate>_bg.wasm', import.meta.url)` through verbatim. From the
    // deps directory that resolves to a path with no `.wasm` beside it, the dev
    // server answers the SPA fallback `index.html`, and wasm-bindgen logs
    // "your server does not serve Wasm with `application/wasm` MIME type"
    // before the instantiate fails outright. `Poseidon.build()` catches that
    // and silently drops to poseidon-lite, ~10x slower over the ~350K arity-5
    // hashes of a tree build — in the main thread and in every scanner worker.
    //
    // Left unbundled, Vite's own asset transform rewrites each `new URL` to the
    // served `.wasm` (`Content-Type: application/wasm`). Only jubjub had a
    // workaround, the explicit `?url` override in `config/wasm.ts`.
    //
    // `#wasm/*` cannot be excluded instead: Vite marks an excluded specifier
    // external and leaves it bare in the chunk, and a package-internal
    // `imports` specifier is unresolvable from `.vite/deps/` — the module 500s.
    exclude: ["@lelantos-org/sdk"],
    include: [
      "assert",
      // The SDK is excluded above, so its CJS dependencies are no longer
      // inlined into its pre-bundle and have to be optimized in their own
      // right — without this, `import { bech32m } from "bech32"` is served the
      // raw CJS file and throws "does not provide an export named 'bech32m'".
      //
      // Both are named through the SDK (`sdk > dep`): a linked SDK
      // (`file:../sdk`) keeps its dependencies in its own `node_modules`, where
      // a bare specifier resolved from here finds nothing. Hoisted under a
      // published SDK, the nested form resolves all the same.
      "@lelantos-org/sdk > bech32",
      // poseidon-lite ships CommonJS (`exports.poseidonN = ...`) with no ESM
      // build, and the SDK imports it by name. Pre-bundling it here is what
      // gives those files real named exports in dev; served raw,
      // `import { poseidonN }` finds no such export and the importer — the
      // main thread and the scanner worker alike — dies on first use.
      //
      // Arities 1-8, matching what the SDK's `crypto/poseidon.ts` imports. Listing them
      // individually because each is its own export subpath; the package root
      // is never imported.
      ...Array.from({ length: 8 }, (_, i) => `@lelantos-org/sdk > poseidon-lite/poseidon${i + 1}`),
    ],
    esbuildOptions: {
      define: { global: "globalThis" },
    },
  },
  build: {
    target: "es2022",
    // "hidden": maps are emitted but no `//# sourceMappingURL` comment is
    // appended, so browsers never request them. They exist for symbolicating a
    // production stack trace after the fact; the Dockerfile deletes them in its
    // builder stage, before dist/ is copied into the runtime image.
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
      output: { manualChunks, chunkFileNames },
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
