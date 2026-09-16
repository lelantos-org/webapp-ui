// The collapsed "Details" row every action screen ends with.
//
// Fully itemised fees above the submit button would be the loudest thing on a
// screen whose subject is the amount. So the row states the resolved figure —
// "Total fees 0.25 USDC · paid in USDC" — and keeps the itemisation one tap
// away. The row is the summary, so
// nothing a decision needs is hidden by collapsing it.
//
// Two things override the collapse. A fee problem the user has to act on opens
// it and tints it (`tone="warn"` with `forceOpen`), since a shortfall hidden
// behind a chevron is a dead submit button with no visible cause.

import { type ReactNode, useEffect, useId, useState } from "react";
import { useCollapseTransition } from "@/shared/hooks/use-collapse-transition";
import { cx } from "@/shared/lib/cx";
import { PANEL_COLLAPSE_MS } from "@/shared/lib/motion";
import { ChevronDownGlyph } from "./icons/glyphs";
import "./DetailsDisclosure.css";

export interface DetailsDisclosureProps {
  /// The resolved answer, right-aligned in the mono face. Visible whether or not
  /// the row is open.
  summary?: ReactNode;
  children: ReactNode;
  /// `warn` tints the summary and chevron, for a problem stated in the body.
  tone?: "neutral" | "warn";
  /// Opens the row whenever this turns true — a shortfall appearing. The user can
  /// still close it afterwards; forcing it to stay open would leave a control
  /// that does nothing.
  forceOpen?: boolean;
}

export function DetailsDisclosure({
  summary,
  children,
  tone = "neutral",
  forceOpen = false,
}: DetailsDisclosureProps) {
  const [open, setOpen] = useState(forceOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  // The body stays mounted through the collapse so there is something to
  // animate, and is removed afterwards so a control inside it — the fee asset
  // picker — is not left in the tab order behind a closed row.
  const { mounted, expanded } = useCollapseTransition(open, PANEL_COLLAPSE_MS);
  const bodyId = useId();

  return (
    <div className={cx("details", tone === "warn" && "details--warn", expanded && "details--open")}>
      <button
        type="button"
        className="details__row"
        aria-expanded={open}
        aria-controls={mounted ? bodyId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="details__lbl">
          Details
          <ChevronDownGlyph size={15} className="details__chev" />
        </span>
        {summary !== undefined ? <span className="details__sum">{summary}</span> : null}
      </button>
      {mounted ? (
        <div
          className={cx("collapse", expanded && "collapse--open")}
          id={bodyId}
          aria-hidden={!open || undefined}
        >
          <div className="collapse__inner">
            <div className="details__body">{children}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
