import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { Plugin } from "vite";

/// Extensions worth precompressing; the prover `.zkey` and `.wasm` dominate.
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

/// Matches nginx's `gzip_min_length`; keep them aligned.
export const MIN_SIZE = 1024;

export interface PrecompressStats {
  files: number;
  before: number;
  after: number;
}

/// Write `<file>.gz` beside every compressible file under `dir` that is big enough and shrinks.
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

/// Precompress build output for nginx `gzip_static`; runs last so it sees VitePWA's files.
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
