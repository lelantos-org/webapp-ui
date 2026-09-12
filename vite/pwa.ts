import type { PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { devProxy } from "./proxy";

/// The service worker and web manifest.
export function pwa(): PluginOption {
  return VitePWA({
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
      // The dark ground, the default theme's, as `index.html`'s theme-color
      // meta starts out (`--bg` in `tokens.css`).
      theme_color: "#14110E",
      background_color: "#14110E",
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
      globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
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
      // The API prefixes are the dev proxy's routes, so the two cannot drift:
      // a navigation under one is a service's, not the app shell's.
      navigateFallbackDenylist: Object.keys(devProxy()).map((prefix) => new RegExp(`^${prefix}`)),
    },
  });
}
