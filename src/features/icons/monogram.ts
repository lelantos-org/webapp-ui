// Deterministic monogram styling for a token or chain mark.
//
// The colour of an unrecognised asset is derived from its identity rather than
// stored, so a token this deployment has never seen still gets a stable,
// distinct mark the first time it renders — and the same one on every later
// load and every device. That is what makes a row scannable by shape: the one
// accent-tinted square every token used to share made them all look alike.
//
// A recognised token or chain overrides the derived hue with its own brand
// colour instead; see `registry.ts`.

import type { CSSProperties } from "react";

/// Letters shown inside the mark.
///
/// Two, not one: a single letter collides constantly across a real registry —
/// USDC, USDT and a `#12` placeholder all repeat their first character — and
/// the colour alone cannot be the thing that separates them for a reader who
/// does not distinguish hues. Three was the claim page's old glyph, and it
/// crowds a 24px box.
///
/// The `#` of an unresolved `#<id>` label is dropped so the mark shows the id
/// rather than punctuation shared by every unnamed asset.
export function monogramText(symbol: string): string {
  const clean = symbol.replace(/^#/, "").trim();
  return clean === "" ? "?" : clean.slice(0, 2).toUpperCase();
}

/// FNV-1a. Small, dependency-free, and — unlike summing character codes — it
/// spreads inputs that differ only near their end. That is exactly this case:
/// token addresses share long prefixes far more often than random strings do,
/// and a sum would hand near-identical hues to a whole deployment.
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    // `Math.imul` keeps the multiply in 32 bits. `h * prime` would exceed 2^53
    // and start dropping low bits to float rounding.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/// An HSL triple, as the brand table stores one.
export type Hsl = readonly [h: number, s: number, l: number];

/// Saturation and lightness for a derived mark.
///
/// Fixed rather than hashed alongside the hue, so every unrecognised token
/// carries the same visual weight against the light palette. Varying lightness
/// per token would make some symbols read as emphasised and others as disabled
/// — meaning the colour is not entitled to carry.
///
/// Tuned for contrast on `--bg-1` at the 11px/700 the marks are set in: the
/// text uses this directly, and the fill and border are derived from it in CSS
/// at low alpha.
const DERIVED_SL: readonly [number, number] = [58, 42];

/// Inline custom properties the `.tok__mark` and `.chain-icon` rules read.
///
/// Emitted as CSS variables rather than as `color` / `background` so the
/// stylesheet keeps ownership of *how* the tint is applied — the fill alpha,
/// the border, the skeleton override — while this module decides only *which*
/// colour. It also keeps the two marks visually in step: they share the rules
/// and differ only in size.
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
