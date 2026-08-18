import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Vitest prefers vitest.config.ts over vite.config.ts and does not merge them,
// so a standalone config here silently diverges from what `vite build` does.
// Notably the `assert` alias (circomlibjs reaches for it at runtime),
// `build.target`, `commonjsOptions` and `worker.format`. Extend instead.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      // A spy installed in one test used to stay installed for the next one in
      // the same file — `link-vault`'s "storage refuses the write" case left
      // `Storage.prototype.setItem` throwing for everything after it. Restoring
      // between tests makes a spy the concern of the test that created it.
      restoreMocks: true,
      setupFiles: ["./vitest.setup.ts"],
      css: false,
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.{test,spec}.{ts,tsx}",
          "src/**/*.d.ts",
          "src/app/main.tsx",
          // Test-only scaffolding.
          "src/test/**",
        ],
      },
    },
  }),
);
