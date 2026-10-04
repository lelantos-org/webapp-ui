import type { GlyphProps } from "./glyphs";

/// Shield outline on the brand mark's 512 grid.
const SHIELD_D = "M256 88 L400 144 V276 C400 356 336 408 256 438 C176 408 112 356 112 276 V144 Z";

export function ShieldGlyph({ size = 14, className }: GlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={SHIELD_D}
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="38"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShieldKeyholeGlyph({ size = 30, className }: GlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={SHIELD_D}
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="32"
        strokeLinejoin="round"
      />
      <circle cx="256" cy="228" r="26" fill="currentColor" />
      <path d="M256 254 L256 320" stroke="currentColor" strokeWidth="22" strokeLinecap="round" />
    </svg>
  );
}
