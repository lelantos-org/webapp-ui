const LINK_ALPHA = 0.14;
const NODE_ALPHA = 0.3;
const PULSE_ALPHA = 0.28;
/// Alpha quantisation steps: fewer draw calls, no visible banding.
export const TIERS = 10;

/// Pre-built `rgba()` strings per alpha tier, so the draw path never allocates.
export interface FieldPalette {
  link: readonly string[];
  node: string;
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

const ACCENT_FALLBACK: [number, number, number] = [224, 121, 74];

/// The `--accent-rgb` token as numbers for canvas painting, with a fallback when unreadable.
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
