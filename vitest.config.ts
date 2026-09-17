import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { alias, appDefine, fsAllow } from "./vite/shared";

// Vitest ignores vite.config.ts when this exists, so shared settings are imported explicitly.
export default defineConfig({
  define: appDefine(),
  resolve: { alias },
  plugins: [react()],
  server: { fs: { allow: fsAllow } },
  test: {
    // Pinned rather than read from the gitignored `.env`.
    env: {
      VITE_REGISTRY_URL: "/registry",
      VITE_RELAYER_URL: "/relayer",
      VITE_FMD_URL: "/fmd",
      VITE_METAQUOTER_URL: "/metaquoter",
    },
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    // Hide the app logger's expected `[scope]` lines; other stderr still prints.
    onConsoleLog: (log, type) => !(type === "stderr" && /^\[[\w:-]+\] /.test(log)),
    css: false,
    pool: "threads",
    // unit: src/**/*.test.ts (node); dom: src/**/*.dom.test.* (jsdom); tooling: vite/**/*.test.ts (node).
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.dom.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.dom.test.{ts,tsx}"],
          setupFiles: ["./src/test/setup/dom.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "tooling",
          environment: "node",
          include: ["vite/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html"],
      // A floor, not a target.
      thresholds: {
        statements: 65,
        lines: 65,
        branches: 86,
        functions: 75,
      },
      include: ["src/**/*.{ts,tsx}", "vite/**/*.ts"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "vite/**/*.test.ts",
        "src/**/*.d.ts",
        "src/app/main.tsx",
        "src/test/**",
      ],
    },
  },
});
