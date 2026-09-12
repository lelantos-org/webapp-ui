// One row of the fee asset picker's list.

import { cx } from "@/shared/lib/cx";
import { formatAssetCompact } from "@/shared/lib/format/asset";
import { TokenIcon } from "@/shared/ui/icons/TokenIcon";
import type { FeeAssetOption } from "./fee-block";
import "./FeeAssetPicker.css";

/// Base units, from the circuit units the relayer quotes in.
///
/// Through `toBaseUnits` rather than a bare `* scale`: a yield asset's unit is
/// worth `scale * index / RAY`, so both the quoted fee and the balance beside it
/// would read low — and an option could show as unaffordable against a balance
/// that in fact covers it.
function human(amount: bigint, asset: FeeAssetOption): string {
  return formatAssetCompact(amount, asset);
}

export interface FeeAssetOptionRowProps {
  id: string;
  option: FeeAssetOption;
  selected: boolean;
  /// Where the keyboard is, which is not focus; see the note on the element.
  active: boolean;
  onHover(): void;
  onPick(): void;
}

/// One asset, its price, and whether this wallet can cover it.
export function FeeAssetOptionRow({
  id,
  option: o,
  selected,
  active,
  onHover,
  onPick,
}: FeeAssetOptionRowProps) {
  return (
    // The listbox pattern: the container holds focus and points at the current
    // row with `aria-activedescendant`, so an option is neither focusable nor
    // separately key-handled. Both rules below assume roving tabindex instead.
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
