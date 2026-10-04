import type { PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { devProxy } from "./proxy";

/// The service worker and web manifest.
export function pwa(): PluginOption {
  return VitePWA({
    // Not "autoUpdate": it purges the precache the open page still lazy-loads chunks from.
    registerType: "prompt",
    includeAssets: ["icon.svg", "icons/*.png"],
    manifest: {
      name: "Lelantos Wallet",
      short_name: "Lelantos",
      description: "Shielded MASP wallet",
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
    devOptions: { enabled: false, type: "module" },
    workbox: {
      globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      // Fallbacks, fetched only when the wasm they stand in for fails: the snarkjs prover, the
      // ffjavascript chunk it pulls in (named after the package's `browser.esm.js`), and the
      // per-arity `poseidon-lite` tables.
      globIgnores: [
        "**/wasm-bindgen-rayon-*/**",
        "**/pkg/snippets/**",
        "**/snarkjs*",
        "**/browser.esm-*",
        "**/poseidon[1-6]-*",
      ],
      navigateFallbackDenylist: Object.keys(devProxy()).map((prefix) => new RegExp(`^${prefix}`)),
    },
  });
}
