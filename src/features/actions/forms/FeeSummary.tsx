// The fee panel: every charge an action carries, itemised, above the submit
// button.
//
// Deliberately always visible rather than behind a disclosure. The figures it
// states are the ones a user is agreeing to by clicking submit, and a fee the
// reader has to go looking for is the problem this panel exists to fix.
//
// Which makes its *movement* the other problem. The panel sits directly above
// the submit button, so anything that changes its height moves the button
// under the pointer, and the two fees it states arrive from two queries at two
// different times. Nothing here is allowed to resize on an answer landing:
//
//   * The row set is decided by the kind and the paying asset, both known at
//     the first render. A row whose figure is still in flight is drawn with a
//     placeholder in place of the figure (`FeeRow.amount === undefined`).
//   * A figure being re-priced keeps the old one on screen and marks the panel
//     `refreshing`, rather than reverting to a placeholder.
//   * Appearing and disappearing — an emptied amount field — is a height
//     transition, not an unmount. The last model is held through the collapse
//     so there is something to animate away.

import { useRef } from "react";
import { cx } from "@/shared/lib/cx";
import { compactFracDigits, formatDecimalCompact } from "@/shared/lib/format";
import { PANEL_COLLAPSE_MS } from "@/shared/lib/motion";
import { useCollapseTransition } from "@/shared/ui/use-collapse-transition";
import { FeeAssetPicker } from "./FeeAssetPicker";
import type { FeeRow, FeeSummaryModel, RowAsset } from "./fee-summary";
import type { FeeAssetChoice } from "./use-fee-panel";

export interface FeeSummaryProps {
  model: FeeSummaryModel | undefined;
  /// A figure already on screen is being re-priced. Marks the panel without
  /// moving it — see the note above on why nothing here may resize.
  refreshing?: boolean;
  /// Omitted where the asset is not the user's to choose — a deposit mints its
  /// relayer note in the deposited asset or the SDK refuses to build.
  feeAsset?: FeeAssetChoice;
}

/// `formatDecimalCompact`'s own default, restated so a caller can pass one
/// explicitly without the two drifting apart.
const DEFAULT_FRAC = 6;

function amountOf(amount: bigint, row: FeeRow, precision: number): string {
  const n = formatDecimalCompact(amount, row.asset.decimals, precision);
  const sign = row.sign === "minus" ? "−" : row.sign === "plus" ? "+" : "";
  return `${sign}${n} ${row.asset.symbol}`.trim();
}

/// The finest precision any of `rows` is displayed at, among those denominated
/// in `asset`.
///
/// A derived figure — the fee total, the bottom line — is rendered at this
/// rather than at the default cap, because the default is a *cap*: dust
/// extends past it to keep four significant digits, and a figure with a whole
/// part does not. A relayer fee of 0.00000002 therefore prints in full while
/// the total it is part of stops at six places, and the panel says
/// `0.0025 + 0.00000002 = 0.0025`. Which is what a withdraw of 1 WETH showed.
function derivedPrecision(rows: FeeRow[], asset: RowAsset): number {
  return rows.reduce(
    (n, r) =>
      r.amount === undefined || r.asset.symbol !== asset.symbol
        ? n
        : Math.max(n, compactFracDigits(r.amount, r.asset.decimals)),
    DEFAULT_FRAC,
  );
}

/// A figure, or the space it will occupy. The placeholder is sized in `ch` of
/// the same monospace face the figure uses, so the row does not shift when the
/// two swap.
function Figure({
  row,
  className,
  precision,
}: {
  row: FeeRow;
  className: string;
  /// Fractional digits to allow. Omitted on a row that stands for itself —
  /// only a figure derived from others has to keep step with them.
  precision?: number;
}) {
  if (row.amount === undefined) {
    return (
      <span className={cx(className, "fees__pending")}>
        <span className="skel-bar fees__skel" aria-hidden />
        <span className="sr-only">pricing</span>
      </span>
    );
  }
  return (
    <span className={cx(className, "mono")}>
      {amountOf(row.amount, row, precision ?? DEFAULT_FRAC)}
    </span>
  );
}

export function FeeSummary({ model, refreshing = false, feeAsset }: FeeSummaryProps) {
  const open = !!model;

  // The model is torn down the instant the amount field empties, which would
  // leave nothing to collapse. Held in a ref rather than state: `feeSummary`
  // returns a fresh object every render, so mirroring it into state would
  // re-render on its own output.
  const held = useRef<FeeSummaryModel | undefined>(undefined);
  if (model) held.current = model;

  const { mounted, expanded } = useCollapseTransition(open, PANEL_COLLAPSE_MS);

  const shown = model ?? (mounted ? held.current : undefined);
  if (!shown) return null;

  return (
    <div className={cx("fees-slot", expanded && "fees-slot--open")} aria-hidden={!open}>
      <div className="fees-slot__inner">
        {/* The picker is withheld on the way out: the panel is still in the DOM
            for the length of the collapse, and a control inside something the
            user has dismissed must not be next in the tab order. */}
        <FeePanelBody
          model={shown}
          refreshing={refreshing}
          feeAsset={open ? feeAsset : undefined}
        />
      </div>
    </div>
  );
}

interface FeePanelBodyProps {
  model: FeeSummaryModel;
  refreshing: boolean;
  feeAsset: FeeAssetChoice | undefined;
}

function FeePanelBody({ model, refreshing, feeAsset }: FeePanelBodyProps) {
  // Only worth offering when there is a choice to make: a relayer that takes
  // one asset is not a picker, it is a label.
  const choosable = feeAsset && feeAsset.options.length > 1;

  // The fee rows are what both derived figures are derived from: the total
  // sums them, and a deposit's bottom line carries them. Measured against the
  // asset each figure is denominated in, since a cross-asset relayer fee is
  // not part of either.
  const feeRows = model.rows.filter((r) => r.key !== "amount");
  const totalPrecision = model.total && derivedPrecision(feeRows, model.total.asset);
  const headlinePrecision = model.headline && derivedPrecision(feeRows, model.headline.asset);

  return (
    <div className="fees" aria-busy={refreshing || undefined}>
      {/* Says a figure is moving without moving one. The old whole-panel dim
          fired on every quote and read as the panel blinking. */}
      <span className={cx("fees__bar", refreshing && "fees__bar--on")} aria-hidden />

      <div className="fees__rows">
        {model.rows.map((row) => (
          <div className="fees__row" key={row.key}>
            <span className="fees__lbl">
              {row.label}
              {row.key === "relayer" && choosable ? <FeeAssetPicker choice={feeAsset} /> : null}
            </span>
            <Figure row={row} className="fees__val" />
          </div>
        ))}

        {model.total ? (
          <div className="fees__row fees__row--total">
            <span className="fees__lbl">{model.total.label}</span>
            <Figure row={model.total} className="fees__val" precision={totalPrecision} />
          </div>
        ) : null}
      </div>

      {model.headline ? (
        <div className="fees__headline">
          <span className="fees__lbl">{model.headline.label}</span>
          <Figure row={model.headline} className="fees__hero" precision={headlinePrecision} />
        </div>
      ) : null}

      {model.crossAsset ? (
        // The fee is spent from a balance the user was not otherwise touching,
        // so it would go unnoticed against the amount row above it.
        <p className="fees__note">
          The relayer is paid from your {model.rows.find((r) => r.key === "relayer")?.asset.symbol}{" "}
          balance, not the amount above.
        </p>
      ) : null}
    </div>
  );
}
