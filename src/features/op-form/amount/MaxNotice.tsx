import type { SpendableMax } from "@lelantos-org/sdk";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPopover } from "@/shared/hooks/use-anchored-popover";
import { cx } from "@/shared/lib/cx";
import { InfoGlyph } from "@/shared/ui/icons/glyphs";
import type { AssetMeta } from "./amount-validation";
import { maxNoticeCopy } from "./balance-hint";
import "./MaxNotice.css";

export interface MaxNoticeProps {
  spendable: SpendableMax | undefined;
  meta: AssetMeta;
  /// "Sending" on Send, "Unshielding" on Unshield.
  verb: string;
}

/// Why Max is below the balance, when the circuit's input cap is the reason.
/// Renders nothing otherwise.
///
/// An "i" beside Max that opens the note, rather than a box under the amount:
/// nothing is wrong and nothing is asked of the user, so the explanation should
/// not cost the form a block of height on every spend that hits the cap. See
/// `maxNoticeCopy` for why the copy avoids "consolidate".
///
/// Portalled and anchored for the same reason as `FeeAssetPicker`: the form's
/// panels animate height through `overflow: hidden`.
export function MaxNotice({ spendable, meta, verb }: MaxNoticeProps) {
  const copy = maxNoticeCopy({ spendable, meta, verb });
  const popId = useId();
  const [open, setOpen] = useState(false);
  const {
    anchorRef: buttonRef,
    floatRef,
    style,
  } = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false));

  // Escape closes from anywhere, since focus stays on the button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, buttonRef]);

  if (!copy) return null;
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={cx("maxnote__btn", open && "maxnote__btn--open")}
        aria-label="Why is Max lower than the balance?"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <InfoGlyph size={16} />
      </button>
      {open
        ? createPortal(
            <div ref={floatRef} id={popId} className="maxnote__pop" style={style}>
              <span className="maxnote__lead">
                Max is <span className="mono">{copy.max}</span>
                {copy.tail}
              </span>
              <span className="maxnote__follow">{copy.follow}</span>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
