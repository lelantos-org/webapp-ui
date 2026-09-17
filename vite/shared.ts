// Settings shared by vite.config.ts and vitest.config.ts.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fromRoot = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

/// Module aliases shared by the app build and the test runner.
export const alias: Record<string, string> = {
  "@": fromRoot("src"),
  // circomlibjs needs `assert` at runtime; Vite would externalize it as empty.
  assert: fromRoot("node_modules/assert"),
};

/// Short commit for the footer: `VITE_COMMIT` (CI has no .git), else git, else `"dev"`.
export function commitRef(): string {
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

/// Compile-time constants substituted into `src/` (declared in `vite-env.d.ts`).
export function appDefine(): Record<string, string> {
  return {
    __COMMIT__: JSON.stringify(commitRef()),
  };
}

/// Dirs the dev server and tests may read: the monorepo, for the linked `../sdk`.
export const fsAllow: string[] = [".."];
