import type { SpendableMax } from "@lelantos-org/sdk";
import { useCallback, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPopover } from "@/shared/hooks/use-anchored-popover";
import { useEscapeKey } from "@/shared/hooks/use-escape-key";
import { cx } from "@/shared/lib/cx";
import { InfoGlyph } from "@/shared/ui/icons/glyphs";
import { Masked } from "@/shared/ui/Masked";
import type { AssetMeta } from "./amount-validation";
import { maxNoticeCopy } from "./balance-hint";
import "./MaxNotice.css";

export interface MaxNoticeProps {
  spendable: SpendableMax | undefined;
  meta: AssetMeta;
  verb: string;
}

/// An "i" beside Max explaining the circuit's input cap, when that is why Max is below the balance.
export function MaxNotice({ spendable, meta, verb }: MaxNoticeProps) {
  const copy = maxNoticeCopy({ spendable, meta, verb });
  const popId = useId();
  const [open, setOpen] = useState(false);
  const {
    anchorRef: buttonRef,
    floatRef,
    style,
  } = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false));

  const closeAndRefocus = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, [buttonRef]);
  useEscapeKey(open ? closeAndRefocus : undefined);

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
                Max is{" "}
                <span className="mono">
                  <Masked>{copy.max}</Masked>
                </span>
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
