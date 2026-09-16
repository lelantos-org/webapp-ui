import { cx } from "@/shared/lib/cx";
import { ArrowRightGlyph } from "@/shared/ui/icons/glyphs";
import { ShieldGlyph } from "@/shared/ui/icons/shield";
import "./BoundaryLine.css";

/// Names the side of the pool an action moves value across, at the moment it is
/// being chosen.
///
/// `deposit` and `withdraw` are accurate about the protocol and silent about
/// what makes it worth using: that
/// one side is public and permanent, and the other is not. A tile label alone
/// cannot carry that, because it has to stay short — so the screen says it once,
/// under the title, where the decision is actually made.
///
/// Deliberately not a warning. Crossing out of the pool is a normal thing to do,
/// and styling it as a hazard would make the honest note read as an accusation.
/// `WithdrawForm` has a real warning for the case that deserves one, when the
/// destination is an address the user already deposited from.
///
/// Two shapes:
///
///   - a route, `from → to`, with the shielded end in the accent — Shield
///     ("Public wallet → Shielded pool") and Unshield ("Shielded pool → A public
///     address — this part is visible on-chain");
///   - a sentence, with the pool's shield, for an op that never leaves the pool —
///     Send ("Stays inside the shielded pool — nothing appears on-chain") and
///     Swap. The whole line is accent, because all of it is inside.
///
/// The arrow is accent when value enters or stays in the pool and muted when it
/// leaves: on Unshield the accent belongs to where the value comes from, not to
/// the crossing out.
export function BoundaryLine(props: BoundaryLineProps) {
  const short = props.short ? <span className="boundary__short">{props.short}</span> : null;

  if ("sentence" in props) {
    return (
      <p className={cx("boundary", "boundary--sentence", props.short && "boundary--has-short")}>
        <span className="boundary__full">
          <ShieldGlyph size={14} className="boundary__shield" />
          <span>{props.sentence}</span>
        </span>
        {short}
      </p>
    );
  }

  const { from, to, shielded } = props;
  const fromIn = shielded === "from";
  const toIn = shielded === "to";
  return (
    <p className={cx("boundary", props.short && "boundary--has-short")}>
      <span className="boundary__full">
        <span className={fromIn ? "accent" : undefined}>{from}</span>
        <ArrowRightGlyph
          size={14}
          className={cx("boundary__arrow", toIn && "boundary__arrow--in")}
        />
        <span className={toIn ? "accent" : undefined}>{to}</span>
      </span>
      {short}
    </p>
  );
}

interface BoundaryShared {
  /// The phone copy, shown instead of the whole line at ≤480px: "Stays inside
  /// the pool", "Shielded pool → a public address". Plain text, no glyph.
  short?: string;
}

export interface BoundaryRouteProps extends BoundaryShared {
  from: string;
  to: string;
  /// Which end is inside the pool, so it can carry the accent.
  shielded: "from" | "to";
}

export interface BoundarySentenceProps extends BoundaryShared {
  /// One sentence about a move that never leaves the pool.
  sentence: string;
}

export type BoundaryLineProps = BoundaryRouteProps | BoundarySentenceProps;
