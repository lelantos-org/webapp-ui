import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { alias, appDefine, fsAllow } from "./vite/shared";

// Vitest ignores vite.config.ts when this exists, so shared settings are imported explicitly.
export default defineConfig({
  define: appDefine(),
  resolve: {
    alias: {
      ...alias,
      "virtual:pwa-register/react": fileURLToPath(
        new URL("./src/test/stubs/pwa-register.ts", import.meta.url),
      ),
    },
  },
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
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          setupFiles: ["./src/test/setup/timers.ts"],
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
          setupFiles: ["./src/test/setup/timers.ts", "./src/test/setup/dom.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "app",
          environment: "jsdom",
          include: ["src/**/*.app.test.tsx"],
          setupFiles: ["./src/test/setup/timers.ts", "./src/test/setup/dom.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "tooling",
          environment: "node",
          setupFiles: ["./src/test/setup/timers.ts"],
          include: ["vite/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html"],
      // A couple of points under what the suite reaches, so a slide shows up as a failure.
      thresholds: {
        statements: 84,
        lines: 84,
        branches: 89,
        functions: 83,
        // The layers everything else stands on.
        "src/shared/**": { statements: 93, lines: 93, branches: 90, functions: 91 },
        "src/config/**": { statements: 90, lines: 90, branches: 94, functions: 89 },
      },
      include: ["src/**/*.{ts,tsx}", "vite/**/*.ts"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "vite/**/*.test.ts",
        "src/**/*.d.ts",
        "src/app/main.tsx",
        "src/test/**",
        "src/features/*/testing.{ts,tsx}",
      ],
    },
  },
});
