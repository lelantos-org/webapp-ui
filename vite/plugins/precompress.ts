import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { Plugin } from "vite";

// Extensions worth precompressing. The prover artifacts dominate: the ~49 MB
// `.zkey` gzips to ~14 MB and the ~3.9 MB circuit `.wasm` to ~1.2 MB. nginx
// would not gzip the zkey at all on its own (it is `application/octet-stream`,
// not in `gzip_types`), and gzipping 49 MB per request would be absurd anyway.
export const COMPRESSIBLE: ReadonlySet<string> = new Set([
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
export const MIN_SIZE = 1024;

export interface PrecompressStats {
  files: number;
  /// Bytes of the sources that got a `.gz`.
  before: number;
  /// Bytes of the `.gz` files written.
  after: number;
}

/// Write `<file>.gz` beside every compressible file under `dir`, recursively.
///
/// Skips a file below `MIN_SIZE`, and one whose gzip would not be smaller.
export function precompressDir(dir: string): PrecompressStats {
  const stats: PrecompressStats = { files: 0, before: 0, after: 0 };

  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
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
      stats.files += 1;
      stats.before += size;
      stats.after += gz.length;
    }
  };

  walk(dir);
  return stats;
}

/// Emits `<file>.gz` next to every compressible build artifact, for nginx
/// `gzip_static`. `.map` files are deliberately skipped: `build.sourcemap` is
/// "hidden" and the Dockerfile strips them, so they never reach the image.
///
/// Runs in `closeBundle` with `enforce: "post"` and sits last in `plugins` so
/// it observes the files VitePWA writes in its own `closeBundle` (`sw.js`,
/// `workbox-*.js`) rather than racing them.
export function precompress(): Plugin {
  let outDir = "dist";
  return {
    name: "precompress-gzip",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const { files, before, after } = precompressDir(outDir);
      const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
      this.info(`precompressed ${files} files: ${mb(before)} MB -> ${mb(after)} MB gzip`);
    },
  };
}
