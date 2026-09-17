import { type ReactNode, useEffect, useId, useState } from "react";
import { useCollapseTransition } from "@/shared/hooks/use-collapse-transition";
import { cx } from "@/shared/lib/cx";
import { PANEL_COLLAPSE_MS } from "@/shared/lib/motion";
import { ChevronDownGlyph } from "./icons/glyphs";
import "./DetailsDisclosure.css";

export interface DetailsDisclosureProps {
  /// The resolved answer, visible whether or not the row is open.
  summary?: ReactNode;
  children: ReactNode;
  /// `warn` tints the summary and chevron, for a problem stated in the body.
  tone?: "neutral" | "warn";
  /// Opens the row whenever this turns true; the user can still close it.
  forceOpen?: boolean;
}

/// The collapsed "Details" row every action screen ends with.
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
