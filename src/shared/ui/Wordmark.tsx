import { Link } from "react-router-dom";
import "./Wordmark.css";

/// The brand mark: a Merkle root and two leaves, with the edges stopping short
/// of the root.
///
/// The tree is what the wallet actually keeps — `tree-persistence.ts` mirrors one
/// locally — and the gap is the point: the structure is public, which leaf is
/// yours is not. Drawn inline rather than loaded from `public/icon.svg` so it
/// inherits `currentColor` and follows the theme without a second asset.
///
/// The mark is ember and the name is ink, in Martian Mono (`--brand`): the
/// wordmark reads as a name beside a symbol rather than as a second accent.
/// `sub` names a route that is not the wallet — `/claim` — and is absent
/// everywhere else.
///
/// A link to `/`, the way back to the wallet from any screen. Named for where it
/// goes: the visible name alone would announce "Lelantos" with no hint that it
/// navigates.
export function Wordmark({ sub }: { sub?: string | undefined }) {
  return (
    <Link to="/" className="brand" aria-label="Lelantos home">
      <svg
        className="brand__mark"
        width="24"
        height="24"
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="16" cy="6.5" r="4" fill="currentColor" />
        <circle cx="6.5" cy="25.5" r="4" fill="currentColor" />
        <circle cx="25.5" cy="25.5" r="4" fill="currentColor" />
        <path
          d="M9 21 L12.4 14.2 M23 21 L19.6 14.2"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <span className="brand__name">LELANTOS</span>
      {sub ? <span className="brand__sub">{sub}</span> : null}
    </Link>
  );
}
