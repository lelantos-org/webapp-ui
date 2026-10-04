import type { CSSProperties } from "react";

/// Up to two letters shown inside the mark, without a leading `#`.
export function monogramText(symbol: string): string {
  const clean = symbol.replace(/^#/, "").trim();
  return clean === "" ? "?" : clean.slice(0, 2).toUpperCase();
}

/// FNV-1a, so addresses sharing long prefixes still get distinct hues.
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const SATURATION = 58;
const LIGHTNESS = 42;

/// `--mono-*` properties for `.tok__mark` and `.chain-icon`: a hue hashed from `seed`.
export function monogramStyle(seed: string): CSSProperties {
  return {
    "--mono-h": `${hash(seed.toLowerCase()) % 360}`,
    "--mono-s": `${SATURATION}%`,
    "--mono-l": `${LIGHTNESS}%`,
  } as CSSProperties;
}
