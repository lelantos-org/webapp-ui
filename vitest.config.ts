import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { alias, appDefine, fsAllow } from "./vite/shared";

// Vitest prefers this file over vite.config.ts and does not merge the two, so
// what the test runner shares with the app config is imported explicitly: the
// module aliases (notably `assert`, which circomlibjs reaches for at runtime),
// the compile-time constants, and the linked SDK's place in `fs.allow`. Nothing
// else applies to tests — the PWA, CSP, link-header and precompress plugins are
// build-only, and `build`, `optimizeDeps` and `worker` are not used by the runner.
export default defineConfig({
  define: appDefine(),
  resolve: { alias },
  plugins: [react()],
  server: { fs: { allow: fsAllow } },
  test: {
    // Node by default: a suite that needs a DOM (a render, `localStorage`,
    // `window`, or `config/env`, which resolves service paths against
    // `location`) says so with `// @vitest-environment jsdom` on its first line.
    // Most suites need nothing more, and skipping jsdom's setup for them is most
    // of the run's environment time.
    environment: "node",
    // The service URLs `config/env.ts` requires, pinned here rather than left
    // to `.env` — which is gitignored, so a suite that depended on it passed
    // locally and failed anywhere the file did not exist. `env.ts` throws at
    // import time on a missing one, which takes down the whole module graph of
    // any suite that touches it, so the failure reads as "cannot collect
    // tests" rather than as a missing variable.
    //
    // Values match `.env.example`; a test that cares about a particular URL
    // parses `Schema` itself rather than relying on these.
    env: {
      VITE_REGISTRY_URL: "/registry",
      VITE_RELAYER_URL: "/relayer",
      VITE_FMD_URL: "/fmd",
      VITE_METAQUOTER_URL: "/metaquoter",
    },
    // Without this a spy installed in one test stays installed for the next one
    // in the same file — a "storage refuses the write" case would leave
    // `Storage.prototype.setItem` throwing for everything after it. Restoring
    // between tests makes a spy the concern of the test that created it.
    restoreMocks: true,
    // The same for globals and env: a `vi.stubGlobal("fetch", …)` in one case
    // does not answer for every case after it in the file.
    unstubGlobals: true,
    unstubEnvs: true,
    // Drops the app logger's `[scope] …` lines, which tests provoke on purpose
    // (a corrupt store, a chain the relayer does not serve). Everything else on
    // stderr — React's act() and key warnings above all — still prints, so a new
    // warning is not buried under expected ones. A test that must prove it logs
    // spies on `console` instead.
    onConsoleLog: (log, type) => !(type === "stderr" && /^\[[\w:-]+\] /.test(log)),
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}", "vite/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html"],
      // A floor, not a target: the levels measured when these were set (66.4%
      // statements and lines, 87.8% branches, 77.3% functions), less a point or
      // two of slack so an unrelated refactor does not trip it. Raise them as
      // coverage grows; `npm run verify` runs the suite with coverage on.
      thresholds: {
        statements: 65,
        lines: 65,
        branches: 86,
        functions: 75,
      },
      include: ["src/**/*.{ts,tsx}", "vite/**/*.ts"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "vite/**/*.test.ts",
        "src/**/*.d.ts",
        "src/app/main.tsx",
        // Test-only scaffolding.
        "src/test/**",
      ],
    },
  },
});
