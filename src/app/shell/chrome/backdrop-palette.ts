// The backdrop's colours: the accent read back out of the stylesheet, and the
// per-tier `rgba()` ramps `BackdropField` strokes with.

const LINK_ALPHA = 0.14;
const NODE_ALPHA = 0.3;
const PULSE_ALPHA = 0.28;
/// Alpha quantisation steps: fewer draw calls, no visible banding.
export const TIERS = 10;

/// Pre-built `rgba()` strings, one per alpha tier.
///
/// Held for the lifetime of the field: the draw path must not allocate, since
/// per-frame string construction introduces GC pauses visible as stutter.
export interface FieldPalette {
  /// Link stroke per tier, index 0 faintest.
  link: readonly string[];
  node: string;
  /// Pulse stroke per tier, index 0 faintest.
  pulse: readonly string[];
}

export function buildPalette([r, g, b]: readonly [number, number, number]): FieldPalette {
  const ramp = (peak: number) =>
    Array.from(
      { length: TIERS },
      (_, i) => `rgba(${r}, ${g}, ${b}, ${(((i + 1) / TIERS) * peak).toFixed(4)})`,
    );
  return {
    link: ramp(LINK_ALPHA),
    node: `rgba(${r}, ${g}, ${b}, ${NODE_ALPHA})`,
    pulse: ramp(PULSE_ALPHA),
  };
}

// Palette tokens read back out of the stylesheet.
//
// A `<canvas>` cannot reference a CSS custom property, so anything painting
// outside CSS resolves `--accent` itself rather than holding a second copy that
// drifts when the palette changes.

/// Matches `--accent` in `styles/tokens.css`. Used only when the property cannot be read,
/// as in jsdom or a call made before the stylesheet applies.
const ACCENT_FALLBACK: [number, number, number] = [224, 121, 74];

export function accentRgb(): [number, number, number] {
  if (typeof getComputedStyle !== "function") return ACCENT_FALLBACK;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb");
  const [r, g, b, ...rest] = raw.split(",").map((p) => Number.parseInt(p.trim(), 10));
  if (
    r !== undefined &&
    g !== undefined &&
    b !== undefined &&
    rest.length === 0 &&
    [r, g, b].every((n) => Number.isFinite(n))
  ) {
    return [r, g, b];
  }
  return ACCENT_FALLBACK;
}
