import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const r = (p: string) => fileURLToPath(new URL(`./node_modules/${p}`, import.meta.url));

/// Short commit the bundle was built from, for the footer.
///
/// `VITE_COMMIT` first because `.git` is in `.dockerignore`: the image build
/// has no repository to ask, so CI passes the value in as a build arg. The
/// `git` call is the local-dev path, and `"dev"` is what an unversioned build
/// (a tarball, a fresh `npm create`) honestly reports rather than guessing.
function commitRef(): string {
  const fromEnv = process.env.VITE_COMMIT?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

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

/// Tightens the `index.html` CSP for the built app.
///
/// One HTML file serves both `vite dev` and the production image, so its meta
/// policy has to be the union of what both need — and the dev half is the loose
/// half. `@vitejs/plugin-react` injects an inline Fast Refresh preamble, which
/// forces `script-src 'unsafe-inline'`; a production build emits no inline
/// script at all (verified against `dist/index.html`), so shipping that
/// allowance only widens what an HTML injection could do on a page that handles
/// a bearer key.
///
/// `connect-src` drops `http:` and `ws:` for the same reason: the app requires
/// a secure context anyway (`crossOriginIsolated` for the wasm prover), so
/// plaintext destinations are only useful to an exfiltrator. `https:`/`wss:`
/// stay broad because chain RPC URLs come from the relayer's `/chains` at
/// runtime and cannot be enumerated at build time.
function tightenCsp(): Plugin {
  return {
    name: "tighten-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html
        .replace(
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
          "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
        )
        .replace("connect-src 'self' http: https: ws: wss:", "connect-src 'self' https: wss:");
    },
  };
}

/// Emits an nginx snippet with a `Link: rel=preload` header for the assets
/// `index.html` loads eagerly.
///
/// The zone has Early Hints enabled (infra/terraform/zone.tf), and Cloudflare
/// builds a `103 Early Hints` response out of the origin's `Link` headers —
/// but only out of `rel=preload` and `rel=preconnect`. nginx sent no `Link` at
/// all, so the setting was on and doing nothing.
///
/// Vite already writes `<link rel="modulepreload">` into the document, but the
/// browser cannot act on those until the document has arrived and been parsed.
/// A 103 starts the same fetches a round-trip earlier, which is worth most on
/// exactly the requests that are slowest: an edge MISS on the document, where
/// the browser would otherwise sit idle for a full trip to the origin.
///
/// Reads the emitted HTML rather than the bundle graph so the header can never
/// disagree with the document — whatever Vite decided to load eagerly is what
/// gets hinted, including the hashes.
///
/// Writes outside `outDir` deliberately: everything under `dist/` is served,
/// and an nginx config fragment is not something to publish. The Dockerfile
/// copies it to /etc/nginx/ from the builder stage.
function linkHeaders(): Plugin {
  let outDir = "dist";
  let root = process.cwd();
  return {
    name: "link-headers",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
    },
    closeBundle() {
      const html = readFileSync(join(outDir, "index.html"), "utf8");

      // `as=script` with `crossorigin`, matching the attributes Vite puts on
      // the tags. The credentials mode has to agree or the preloaded response
      // is not reused and the asset is fetched twice.
      //
      // `rel=preload`, not `rel=modulepreload`, because Cloudflare drops
      // anything else when it synthesises the 103.
      const links: string[] = [];
      const push = (href: string, as: string) =>
        links.push(`<${href}>; rel=preload; as=${as}; crossorigin`);

      for (const [, href] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) push(href, "script");
      for (const [, href] of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) {
        push(href, "script");
      }
      // Render-blocking, so the least ambiguous win of the three.
      for (const [, href] of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
        push(href, "style");
      }

      const dir = join(root, ".nginx");
      mkdirSync(dir, { recursive: true });
      const dest = join(dir, "link-headers.conf");
      if (links.length === 0) {
        // An empty file rather than none: the Dockerfile COPY and the nginx
        // include both reference it unconditionally, and a missing file fails
        // the image build with a message about the copy rather than about the
        // markup that stopped matching.
        writeFileSync(dest, "# No eagerly-loaded assets found in index.html.\n");
        this.warn("link-headers: nothing matched in index.html; wrote an empty snippet");
        return;
      }
      writeFileSync(dest, `add_header Link "${links.join(", ")}" always;\n`);
      this.info(`link-headers: hinted ${links.length} assets`);
    },
  };
}

export default defineConfig({
  define: {
    __COMMIT__: JSON.stringify(commitRef()),
  },
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
    tightenCsp(),
    linkHeaders(),
    // Last on purpose — see the note on `precompress`.
    precompress(),
  ],
  optimizeDeps: {
    include: [
      "@lelantos-org/sdk",
      "assert",
      // poseidon-lite ships CommonJS (`exports.poseidonN = ...`) with no ESM
      // build. Pre-bundling it here is what gives those files real named
      // exports in dev.
      //
      // It is reachable two ways, and only one of them was covered before.
      // Statically, `crypto/poseidon.js` is pulled into the SDK's own
      // pre-bundle and inlined — fine. But the scanner worker
      // (`sync/worker/entry.js`) reaches it through a *dynamic*
      // `import("../../crypto/poseidon.js")`, which Vite serves as its own
      // module outside that bundle. The bare specifier there is rewritten to
      // `/node_modules/poseidon-lite/poseidonN.js?v=<hash>` and served raw, so
      // `import { poseidonN }` finds no such export and the worker dies on
      // first use.
      //
      // Arities 1-8, matching what `crypto/poseidon.js` imports. Listing them
      // individually because each is its own export subpath; the package root
      // is never imported.
      ...Array.from({ length: 8 }, (_, i) => `poseidon-lite/poseidon${i + 1}`),
    ],
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
        // Dev proxy target. Defaults to the local relayer; point
        // RELAYER_PROXY_TARGET at a deployed one (e.g.
        // https://relayer.lelantos.xyz) to develop against it. The proxy runs
        // server-side, so it sidesteps the deployed relayer's CORS policy,
        // which only allows the https://app.lelantos.xyz origin.
        target: process.env.RELAYER_PROXY_TARGET ?? "http://localhost:3003",
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
