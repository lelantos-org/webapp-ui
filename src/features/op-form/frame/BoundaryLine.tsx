import { cx } from "@/shared/lib/cx";
import { ArrowRightGlyph } from "@/shared/ui/icons/glyphs";
import { ShieldGlyph } from "@/shared/ui/icons/shield";
import "./BoundaryLine.css";

/// Names the pool boundary an action crosses: a `from → to` route, or a sentence for an op that stays inside.
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
  /// Phone copy shown instead of the full line at ≤480px.
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
