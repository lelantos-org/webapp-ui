// Deterministic monogram styling for a token or chain mark.
//
// The colour of an unrecognised asset is derived from its identity rather than
// stored, so a token this deployment has never seen gets a stable, distinct mark
// on first render and the same one on every later load and device, keeping rows
// scannable.
//
// A recognised token or chain overrides the derived hue with its own brand
// colour; see `registry.ts`.

import type { CSSProperties } from "react";

/// Letters shown inside the mark.
///
/// Two letters. One collides frequently across a real registry — USDC, USDT and
/// a `#12` placeholder all share a first character — and colour alone cannot
/// separate them for a reader who does not distinguish hues. Three crowds a 24px
/// box.
///
/// The `#` of an unresolved `#<id>` label is dropped so the mark shows the id
/// rather than punctuation shared by every unnamed asset.
export function monogramText(symbol: string): string {
  const clean = symbol.replace(/^#/, "").trim();
  return clean === "" ? "?" : clean.slice(0, 2).toUpperCase();
}

/// FNV-1a: small, dependency-free, and, unlike a character-code sum, it spreads
/// inputs differing only near their end. Token addresses share long prefixes far
/// more often than random strings, so a sum would give a whole deployment
/// near-identical hues.
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    // `Math.imul` keeps the multiply in 32 bits; `h * prime` would exceed 2^53
    // and drop low bits to float rounding.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/// An HSL triple, as the brand table stores one.
export type Hsl = readonly [h: number, s: number, l: number];

/// Saturation and lightness for a derived mark.
///
/// Fixed rather than hashed alongside the hue, so every unrecognised token
/// carries the same visual weight. Varying lightness per token would read as
/// emphasis or as a disabled state, which the colour is not meant to convey.
///
/// Tuned for contrast on `--bg-1` at the 11px/700 the marks are set in. The text
/// uses this directly; the fill and border are derived from it in CSS at low
/// alpha.
const DERIVED_SL: readonly [number, number] = [58, 42];

/// Inline custom properties the `.tok__mark` and `.chain-icon` rules read.
///
/// Emitted as CSS variables rather than `color` or `background`, so the
/// stylesheet owns how the tint is applied — fill alpha, border, skeleton
/// override — while this module decides only which colour. The two marks share
/// those rules and differ only in size.
///
/// Cast because `CSSProperties` has no index signature for custom properties;
/// React passes any `--*` key through to the style attribute unchanged.
export function monogramStyle(seed: string, brand?: Hsl): CSSProperties {
  const [h, s, l] = brand ?? [hash(seed.toLowerCase()) % 360, ...DERIVED_SL];
  return {
    "--mono-h": `${h}`,
    "--mono-s": `${s}%`,
    "--mono-l": `${l}%`,
  } as CSSProperties;
}
