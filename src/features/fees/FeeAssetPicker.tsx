// Which token pays the relayer.
//
// A listbox rather than a native `<select>`, because the options differ in what
// the relay costs in each asset, what this wallet holds of each, and whether the
// second covers the first. A native option list can carry only a symbol, leaving
// the figures the decision turns on off screen.
//
// Affordable options are selectable; unaffordable ones stay visible, since
// topping one up is a valid response and a hidden row cannot suggest it.
//
// The list is portalled to `<body>` and anchored to the trigger's viewport rect
// rather than positioned inside its row. The fee panel animates its height
// through a wrapper carrying `overflow: hidden` (see `FeeSummary`), which clips
// any descendant reaching past the panel, and this list is taller than the panel
// by design. See `useAnchoredPopover`.

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/shared/lib/cx";
import { ChevronDownSmallGlyph } from "@/shared/ui/glyphs";
import { useAnchoredPopover } from "@/shared/ui/use-anchored-popover";
import { FeeAssetOptionRow } from "./FeeAssetOptionRow";
import type { FeeAssetChoice, FeeAssetOption } from "./fee-block";
import "./FeeAssetPicker.css";

export interface FeeAssetPickerProps {
  choice: FeeAssetChoice;
}

export function FeeAssetPicker({ choice }: FeeAssetPickerProps) {
  const { options, value, onChange } = choice;
  const listId = useId();
  const optionId = (o: FeeAssetOption) => `${listId}-${o.id}`;

  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const {
    anchorRef: buttonRef,
    floatRef,
    flipped,
    style,
  } = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false));

  const selectedIndex = options.findIndex((o) => o.id === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  // Where the keyboard is, which is distinct from the selection: arrowing
  // through the list passes over options — including unaffordable ones, so they
  // are announced — before committing to any.
  const [active, setActive] = useState(0);

  const openList = () => {
    setActive(Math.max(0, selectedIndex));
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const commit = (o: FeeAssetOption) => {
    if (!o.affordable) return;
    onChange(o.id);
    close();
  };

  // Opening from the button moves focus to the list, so the arrow keys act on it
  // without a second press.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const onListKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    switch (e.key) {
      case "ArrowDown":
        setActive((i) => Math.min(last, i + 1));
        break;
      case "ArrowUp":
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Home":
        setActive(0);
        break;
      case "End":
        setActive(last);
        break;
      case "Enter":
      case " ": {
        const o = options[active];
        if (o) commit(o);
        break;
      }
      case "Escape":
        close();
        break;
      // Leaving the popover dismisses it, and Tab is already moving focus, so
      // neither refocus nor `preventDefault` applies.
      case "Tab":
        close(false);
        return;
      default:
        return;
    }
    e.preventDefault();
  };

  const list = (
    <div ref={floatRef} className={cx("feepick__pop", flipped && "feepick__pop--up")} style={style}>
      <p className="feepick__hint">Pay the relayer in</p>
      <div
        ref={listRef}
        id={listId}
        className="feepick__list"
        role="listbox"
        tabIndex={-1}
        aria-activedescendant={options[active] ? optionId(options[active]) : undefined}
        onKeyDown={onListKey}
      >
        {options.map((o, i) => (
          <FeeAssetOptionRow
            key={o.id.toString()}
            id={optionId(o)}
            option={o}
            selected={o.id === value}
            active={i === active}
            onHover={() => setActive(i)}
            onPick={() => commit(o)}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="feepick">
      <button
        ref={buttonRef}
        type="button"
        className={cx("feepick__btn", open && "feepick__btn--open")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`asset to pay the relayer in — ${selected?.symbol ?? "choose"}`}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
        }}
      >
        <span>{selected?.symbol ?? "—"}</span>
        <ChevronDownSmallGlyph className="feepick__chev" />
      </button>

      {open && typeof document !== "undefined" ? createPortal(list, document.body) : null}
    </div>
  );
}
