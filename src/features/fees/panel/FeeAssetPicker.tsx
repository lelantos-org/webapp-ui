import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPopover } from "@/shared/hooks/use-anchored-popover";
import { cx } from "@/shared/lib/cx";
import { formatAssetCompact } from "@/shared/lib/format/asset";
import { ChevronDownSmallGlyph } from "@/shared/ui/icons/glyphs";
import { TokenIcon } from "@/shared/ui/icons/TokenIcon";
import type { FeeAssetChoice, FeeAssetOption } from "../model/fee-block";
import "./FeeAssetPicker.css";

/// Props for `FeeAssetPicker`.
export interface FeeAssetPickerProps {
  choice: FeeAssetChoice;
}

/// Listbox choosing which asset pays the relayer, with each option's cost and balance.
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

      {/* Portalled: the fee panel's `overflow: hidden` wrapper would clip the list. */}
      {open && typeof document !== "undefined" ? createPortal(list, document.body) : null}
    </div>
  );
}

interface FeeAssetOptionRowProps {
  id: string;
  option: FeeAssetOption;
  selected: boolean;
  active: boolean;
  onHover(): void;
  onPick(): void;
}

function FeeAssetOptionRow({
  id,
  option: o,
  selected,
  active,
  onHover,
  onPick,
}: FeeAssetOptionRowProps) {
  return (
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
          {o.balance === undefined ? (
            <>balance …</>
          ) : o.affordable ? (
            <>balance {formatAssetCompact(o.balance, o)}</>
          ) : (
            <>needs {formatAssetCompact(o.amount - o.balance, o)} more</>
          )}
        </span>
      </span>
      <span className="feepick__cost mono">{formatAssetCompact(o.amount, o)}</span>
    </div>
  );
}
