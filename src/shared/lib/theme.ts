// Palette tokens read back out of the stylesheet.
//
// A `<canvas>` cannot reference a CSS custom property, so anything painting
// outside of CSS has to resolve `--accent` itself rather than hard-coding a
// second copy of it that drifts when the palette changes.

/// Matches `--accent` in styles.css; used only when the property cannot be read
/// (jsdom, or a call before the stylesheet applies).
const ACCENT_FALLBACK: [number, number, number] = [79, 70, 229];

export function accentRgb(): [number, number, number] {
  if (typeof getComputedStyle !== "function") return ACCENT_FALLBACK;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb");
  const parts = raw.split(",").map((p) => Number.parseInt(p.trim(), 10));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    return [parts[0], parts[1], parts[2]];
  }
  return ACCENT_FALLBACK;
}
