// The fee panel: every charge an action carries, itemised.
//
// Two presentations of one model:
//
//   * `details` — the rows, for the body of a `DetailsDisclosure`, which does
//     the collapsing. The fee asset picker stays on the relayer row.
//   * `review` — the itemised rows of the Send and Unshield reviews: 15px,
//     unsigned, labelled "Relayer fee · paid in USDC", with the caller's own
//     closing rows ("Leaves your balance", "They receive") under them.
//
// The rows sit directly above the submit button, so any height change moves
// that button under the pointer, and the two fees they state arrive from two
// queries at different times. Nothing here resizes when an answer lands:
//
//   * The row set is decided by the kind and the paying asset, both known at the
//     first render. A row whose figure is in flight is drawn with a placeholder
//     (`FeeRow.amount === undefined`).
//   * A figure being re-priced keeps the old one on screen and marks the rows
//     `refreshing` rather than reverting to a placeholder.

import type { ReactNode } from "react";
import { cx } from "@/shared/lib/cx";
import { formatBaseFixed } from "@/shared/lib/format/asset";
import { compactFracDigits, formatDecimalCompact } from "@/shared/lib/format/number";
import { FeeAssetPicker } from "./FeeAssetPicker";
import type { FeeAssetChoice } from "./fee-block";
import { crossAssetNote } from "./fee-copy";
import type { FeeRow, FeeSummaryModel, RowAsset } from "./fee-summary";
import "./FeeSummary.css";

/// A closing line the review adds under the fee rows.
export interface FeeExtraRow {
  label: string;
  value: ReactNode;
  /// Drawn in the foreground colour, as the bottom line of the review is.
  strong?: boolean;
}

export interface FeeSummaryProps {
  model: FeeSummaryModel | undefined;
  /// See the note at the top of this file.
  variant: "details" | "review";
  /// `review` only: rows under the fee rows, such as "Leaves your balance".
  extraRows?: readonly FeeExtraRow[];
  /// A figure already on screen is being re-priced. Marks the panel without
  /// moving it; see the note above on why nothing here may resize.
  refreshing?: boolean;
  /// Omitted where the asset is not the user's to choose: a deposit mints its
  /// relayer note in the deposited asset or the SDK refuses to build.
  feeAsset?: FeeAssetChoice | undefined;
}

/// `formatDecimalCompact`'s default, restated so a caller can pass one
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
/// A derived figure — the fee total or the bottom line — is rendered at this
/// precision rather than the default, which is a cap that dust extends past to
/// keep four significant digits while a figure with a whole part does not.
/// Without it a relayer fee of 0.00000002 prints in full while the total
/// containing it stops at six places, so the panel reads
/// `0.0025 + 0.00000002 = 0.0025`.
function derivedPrecision(rows: FeeRow[], asset: RowAsset): number {
  return rows.reduce(
    (n, r) =>
      r.amount === undefined || r.asset.symbol !== asset.symbol
        ? n
        : Math.max(n, compactFracDigits(r.amount, r.asset.decimals)),
    DEFAULT_FRAC,
  );
}

/// A figure, or the space it will occupy. The placeholder is sized in `ch` of the
/// same monospace face as the figure, so the row does not shift when the two
/// swap.
function Figure({
  row,
  className,
  precision,
}: {
  row: FeeRow;
  className: string;
  /// Fractional digits to allow. Omitted on a row that stands alone; only a
  /// figure derived from others must keep step with them.
  precision?: number | undefined;
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

export function FeeSummary({
  model,
  refreshing = false,
  feeAsset,
  variant,
  extraRows,
}: FeeSummaryProps) {
  if (variant === "review") return model ? <FeeReview model={model} extraRows={extraRows} /> : null;
  return model ? (
    <FeeRows model={model} refreshing={refreshing} feeAsset={feeAsset} />
  ) : (
    <p className="fees__note">Enter an amount to see what it costs.</p>
  );
}

interface FeeRowsProps {
  model: FeeSummaryModel;
  refreshing: boolean;
  feeAsset: FeeAssetChoice | undefined;
}

function FeeRows({ model, refreshing, feeAsset }: FeeRowsProps) {
  // Only offered when there is a choice: a relayer taking a single asset needs a
  // label rather than a picker.
  const choosable = feeAsset && feeAsset.options.length > 1;

  // Both derived figures come from the fee rows: the total sums them, and a
  // deposit's bottom line carries them. Measured against the asset each figure
  // is denominated in, since a cross-asset relayer fee is part of neither.
  const feeRows = model.rows.filter((r) => r.key !== "amount");
  const totalPrecision = model.total && derivedPrecision(feeRows, model.total.asset);
  const headlinePrecision = model.headline && derivedPrecision(feeRows, model.headline.asset);
  const note = crossAssetNote(model);

  return (
    <div className="fees" aria-busy={refreshing || undefined}>
      {/* Signals that a figure is being re-priced without moving the layout. */}
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

      {note ? (
        // The fee is spent from a balance the user is not otherwise touching, so
        // it would go unnoticed against the amount row above.
        <p className="fees__note">{note}</p>
      ) : null}
    </div>
  );
}

/// The label a row carries on the review, where each fee names how it is
/// charged: "Protocol fee · 0.25%", "Relayer fee · paid in USDC".
function reviewLabel(row: FeeRow): string {
  switch (row.key) {
    case "protocol":
      return row.rate ? `Protocol fee · ${row.rate}` : "Protocol fee";
    case "relayer":
      return `Relayer fee · paid in ${row.asset.symbol}`;
    default:
      return row.label;
  }
}

/// The itemised rows of a review screen.
///
/// Unsigned: the review states each charge as what it is, and the caller's
/// closing rows say where it lands. A row still being priced shows "—", and the
/// review's Confirm is held on `allPriced` until it has a figure.
function FeeReview({
  model,
  extraRows,
}: {
  model: FeeSummaryModel;
  extraRows: readonly FeeExtraRow[] | undefined;
}) {
  return (
    <dl className="fees-review">
      {model.rows.map((row) => (
        <div className="fees-review__row" key={row.key}>
          <dt className="fees-review__lbl">{reviewLabel(row)}</dt>
          <dd className="fees-review__val mono">
            {row.amount === undefined ? (
              <>
                <span aria-hidden>—</span>
                <span className="sr-only">pricing</span>
              </>
            ) : (
              formatBaseFixed(row.amount, row.asset, 8)
            )}
          </dd>
        </div>
      ))}
      {extraRows?.map((row) => (
        <div className="fees-review__row" key={row.label}>
          <dt className="fees-review__lbl">{row.label}</dt>
          <dd className={cx("fees-review__val mono", row.strong && "fees-review__val--strong")}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
