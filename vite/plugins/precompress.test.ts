import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIN_SIZE, precompressDir } from "./precompress";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "precompress-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const compressible = (bytes: number) => "const x = 1;\n".repeat(Math.ceil(bytes / 13));

describe("precompressDir", () => {
  it("writes a .gz that decompresses to the source, recursively", () => {
    mkdirSync(join(dir, "assets"));
    const js = compressible(8 * MIN_SIZE);
    writeFileSync(join(dir, "assets", "index.js"), js);

    const stats = precompressDir(dir);

    const gz = join(dir, "assets", "index.js.gz");
    expect(gunzipSync(readFileSync(gz)).toString()).toBe(js);
    expect(stats.files).toBe(1);
    expect(stats.before).toBe(Buffer.byteLength(js));
    expect(stats.after).toBe(readFileSync(gz).length);
  });

  it("skips files below nginx's gzip_min_length", () => {
    writeFileSync(join(dir, "tiny.js"), compressible(MIN_SIZE / 2).slice(0, MIN_SIZE - 1));
    expect(precompressDir(dir).files).toBe(0);
    expect(existsSync(join(dir, "tiny.js.gz"))).toBe(false);
  });

  it("skips extensions it does not serve compressed", () => {
    for (const name of ["index.js.map", "icon.png", "font.woff2"]) {
      writeFileSync(join(dir, name), compressible(8 * MIN_SIZE));
    }
    expect(precompressDir(dir).files).toBe(0);
  });

  it("skips a file whose gzip would be no smaller", () => {
    writeFileSync(join(dir, "noise.wasm"), randomBytes(8 * MIN_SIZE));
    expect(precompressDir(dir).files).toBe(0);
    expect(existsSync(join(dir, "noise.wasm.gz"))).toBe(false);
  });

  it("covers the prover artifacts", () => {
    writeFileSync(join(dir, "4x6.wasm"), compressible(8 * MIN_SIZE));
    writeFileSync(join(dir, "4x6_final.zkey"), compressible(8 * MIN_SIZE));
    expect(precompressDir(dir).files).toBe(2);
  });
});
