// The line glyphs the app draws.
//
// Apart from the token and chain artwork beside this file, the pool's shield
// (`shield.tsx`) and third-party brand marks (`brand.tsx`): these are the plain
// line marks — chevrons, arrows, the copy and power
// buttons' marks, the theme toggle's sun and moon. Each is `currentColor` on a
// 24-unit grid unless it says otherwise, so a parent's
// colour is the glyph's colour, and each is `aria-hidden` — the text beside it,
// or the button's label, always carries the meaning.
//
// Collected here rather than drawn inline where each was first needed, so a
// glyph is found, and restyled, in one place.

import type { ReactNode } from "react";

export interface GlyphProps {
  size?: number | undefined;
  className?: string | undefined;
}

/// Which stroke ends and corners are rounded. Most glyphs round both; a few
/// are drawn with square ends, and keep them.
type Rounding = "both" | "cap" | "none";

function Svg({
  size = 18,
  className,
  strokeWidth = 2,
  children,
  viewBox = "0 0 24 24",
  round = "both",
}: GlyphProps & {
  strokeWidth?: number;
  children: ReactNode;
  viewBox?: string;
  round?: Rounding;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap={round === "none" ? undefined : "round"}
      strokeLinejoin={round === "both" ? "round" : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/// A glyph component drawing `paths`. `size` is a default the caller may
/// override; the other options are fixed to the glyph.
function glyph(
  paths: ReactNode,
  {
    size,
    ...fixed
  }: { size?: number; strokeWidth?: number; viewBox?: string; round?: Rounding } = {},
) {
  return function Glyph(p: GlyphProps) {
    return (
      <Svg size={size} {...p} {...fixed}>
        {paths}
      </Svg>
    );
  };
}

/// Warning triangle, as on every warn and err box.
export const WarnGlyph = glyph(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);

/// Circled "i", for neutral notes.
export const InfoGlyph = glyph(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </>,
  { strokeWidth: 1.9 },
);

export const ChevronDownGlyph = glyph(<path d="m6 9 6 6 6-6" />);

/// The small chevron on the fee asset picker's trigger, on its own 12-unit grid.
export const ChevronDownSmallGlyph = glyph(<path d="M2.5 4.5 6 8l3.5-3.5" />, {
  size: 10,
  viewBox: "0 0 12 12",
  strokeWidth: 1.6,
});

export const ChevronRightGlyph = glyph(<path d="m9 18 6-6-6-6" />);

export const ChevronLeftGlyph = glyph(<path d="m15 18-6-6 6-6" />);

/// The boundary arrow: a shaft and a head, pointing right.
export const ArrowRightGlyph = glyph(
  <>
    <path d="M5 12h13" />
    <path d="m13 6 6 6-6 6" />
  </>,
);

/// Straight down, from what you pay to what you receive: Swap's flip button.
///
/// Drawn rather than typed. A typed `↓` or `⇅` sits off-centre in its own line
/// box and renders at a different weight per platform font, so no amount of
/// flex centring squares it inside a 40px button.
export const ArrowDownGlyph = glyph(
  <>
    <path d="M12 5v14" />
    <path d="m6 13 6 6 6-6" />
  </>,
);

/// The only glyph whose weight a caller sets: the step marks draw it heavier.
export function CheckGlyph(p: GlyphProps & { strokeWidth?: number }) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 2.6}>
      <path d="m5 12 5 5L20 7" />
    </Svg>
  );
}

export const CrossGlyph = glyph(<path d="M18 6 6 18M6 6l12 12" />, { strokeWidth: 2.4 });

/// A padlock, on the Welcome passkey row: the key stays on the device.
export const LockGlyph = glyph(
  <>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 1 1 8 0v3" />
  </>,
  { strokeWidth: 1.9 },
);

/// The disconnect button's mark.
export const PowerGlyph = glyph(
  <>
    <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
    <path d="M12 2v10" />
  </>,
  { round: "cap" },
);

/// Two overlapping sheets, square-cornered.
export const CopyGlyph = glyph(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </>,
  { strokeWidth: 1.8, round: "none" },
);

export const QrGlyph = glyph(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM20 20h1M17 20v1" />
  </>,
  { strokeWidth: 1.8, round: "none" },
);

/// The theme toggle's sun: a disc and its rays, the rays alone rounded.
export const SunGlyph = glyph(
  <>
    <circle cx="12" cy="12" r="4" />
    <path
      d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
      strokeLinecap="round"
    />
  </>,
  { strokeWidth: 1.8, round: "none" },
);

export const MoonGlyph = glyph(
  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinejoin="round" />,
  { strokeWidth: 1.8, round: "none" },
);

/// A burst of rays: the setup card's invitation, as against the warning
/// triangle.
export const RaysGlyph = glyph(
  <path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9" />,
  { strokeWidth: 1.9 },
);

/// An open arc, for the in-flight tile. Spun by CSS, which stops it under
/// reduced motion.
export const ArcGlyph = glyph(<path d="M21 12a9 9 0 1 1-6.2-8.6" />);
