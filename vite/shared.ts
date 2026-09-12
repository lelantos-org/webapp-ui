// What the app build (`vite.config.ts`) and the test runner (`vitest.config.ts`)
// share: module aliases, compile-time constants, and the directories the dev
// server may read from.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/// A path under the project root, resolved from this file rather than the cwd.
const fromRoot = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

/// Module aliases shared by the app build and the test runner.
export const alias: Record<string, string> = {
  "@": fromRoot("src"),
  // circomlibjs's `poseidon_*.js` reaches for `assert` at runtime.
  // Polyfill via the npm `assert` package so the browser bundle has
  // a real impl (Vite would otherwise externalize it as empty).
  assert: fromRoot("node_modules/assert"),
};

/// Short commit the bundle was built from, for the footer.
///
/// `VITE_COMMIT` first because `.git` is in `.dockerignore`: the image build
/// has no repository to ask, so CI passes the value in as a build arg. The
/// `git` call is the local-dev path, and `"dev"` is what an unversioned build
/// (a tarball, a fresh `npm create`) honestly reports rather than guessing.
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

/// Directories the dev server — and the test runner, which serves modules
/// through the same pipeline — may read from.
///
/// SDK is linked from `../sdk` (file:../sdk). Vite's default fs.allow
/// is the project root only; widen to the monorepo so worker URLs that
/// resolve to `../sdk/dist/...` (e.g. `@lelantos-org/sdk/prover-worker`)
/// are servable in dev, and so the SDK's `?url` wasm imports resolve in tests.
export const fsAllow: string[] = [".."];
