// Which token pays the relayer.
//
// This was a bare `<select>` on the relayer row, and the choice it presents is
// not one a `<select>` can present: the assets differ in what the relay costs
// in each, in what this wallet holds of each, and in whether the second covers
// the first. All a native option list could carry was a symbol and the word
// "insufficient", so the figures the decision actually turns on were not on
// screen at the moment of deciding.
//
// A listbox instead, with the price and the balance on every row. Affordable
// options stay selectable, unaffordable ones stay *visible* — an option the
// relayer takes but the wallet cannot cover is worth seeing, because "top this
// up" is a real answer to it and a hidden row cannot suggest one.
//
// The list is portalled to `<body>` and anchored to the trigger's viewport
// rect rather than positioned inside the row it belongs to. It has to be: the
// fee panel animates its own height through a wrapper carrying
// `overflow: hidden` (see `FeeSummary`), which clips any descendant reaching
// past the panel — and this list is taller than the panel by design. Nothing
// short of leaving the subtree escapes that clip. See `useAnchoredPopover`.

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TokenIcon } from "@/features/icons";
import { cx } from "@/shared/lib/cx";
import { formatDecimalCompact } from "@/shared/lib/format";
import { useAnchoredPopover } from "@/shared/ui/use-anchored-popover";
import type { FeeAssetChoice, FeeAssetOption } from "./use-fee-panel";

/// Base units, from the circuit units the relayer quotes in.
function human(amount: bigint, asset: FeeAssetOption): string {
  return formatDecimalCompact(amount * asset.scale, asset.decimals);
}

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
  // Where the keyboard is, which is not where the selection is: arrowing
  // through the list must be able to pass over an option before committing to
  // it, including an unaffordable one — announcing it is the point.
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

  // Opening from the button hands the list the keyboard, so the arrow keys go
  // somewhere useful without a second press.
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
      // Leaving the popover is dismissing it, and Tab is on its way somewhere
      // — so no refocus, and no `preventDefault` either.
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
          <Option
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
        <span className="feepick__sym">{selected?.symbol ?? "—"}</span>
        <Chevron />
      </button>

      {open && typeof document !== "undefined" ? createPortal(list, document.body) : null}
    </div>
  );
}

interface OptionProps {
  id: string;
  option: FeeAssetOption;
  selected: boolean;
  /// Where the keyboard is. Not focus — see the note on the element itself.
  active: boolean;
  onHover(): void;
  onPick(): void;
}

/// One asset, its price, and whether this wallet can cover it.
function Option({ id, option: o, selected, active, onHover, onPick }: OptionProps) {
  return (
    // The listbox pattern proper: the container holds focus and points at the
    // current row with `aria-activedescendant`, so an option is neither
    // focusable nor separately key-handled. Both rules below assume the
    // roving-tabindex pattern instead.
    // biome-ignore lint/a11y/useFocusableInteractive: focus stays on the listbox by design
    // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled once, on the listbox
    <div
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={!o.affordable}
      className={cx(
        "feepick__opt",
        active && "feepick__opt--active",
        selected && "feepick__opt--on",
        !o.affordable && "feepick__opt--off",
      )}
      onPointerMove={onHover}
      onClick={onPick}
    >
      <TokenIcon symbol={o.symbol} />
      <span className="feepick__name">
        <span className="feepick__optsym">{o.symbol}</span>
        <span className="feepick__bal">
          {o.affordable ? (
            <>balance {human(o.balance, o)}</>
          ) : (
            <>needs {human(o.amount - o.balance, o)} more</>
          )}
        </span>
      </span>
      <span className="feepick__cost mono">{human(o.amount, o)}</span>
    </div>
  );
}

function Chevron() {
  return (
    <svg
      className="feepick__chev"
      viewBox="0 0 12 12"
      width="10"
      height="10"
      role="presentation"
      aria-hidden
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
