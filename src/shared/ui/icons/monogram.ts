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

/// An HSL triple, as the brand table stores one.
export type Hsl = readonly [h: number, s: number, l: number];

const DERIVED_SL: readonly [number, number] = [58, 42];

/// The `--mono-*` custom properties `.tok__mark` and `.chain-icon` read: brand hue or one hashed from `seed`.
export function monogramStyle(seed: string, brand?: Hsl): CSSProperties {
  const [h, s, l] = brand ?? [hash(seed.toLowerCase()) % 360, ...DERIVED_SL];
  return {
    "--mono-h": `${h}`,
    "--mono-s": `${s}%`,
    "--mono-l": `${l}%`,
  } as CSSProperties;
}
