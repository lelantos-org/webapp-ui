import type { ReactNode } from "react";
import { cx } from "@/shared/lib/cx";
import { formatBaseFixed } from "@/shared/lib/format/asset";
import { compactFracDigits, formatDecimalCompact } from "@/shared/lib/format/number";
import type { FeeAssetChoice } from "../model/fee-block";
import { crossAssetNote, REVIEW_FRAC } from "../model/fee-copy";
import { type FeeRow, type FeeSummaryModel, feeRowsOf, type RowAsset } from "../model/fee-summary";
import { FeeAssetPicker } from "./FeeAssetPicker";
import "./FeeSummary.css";

/// A closing line the review adds under the fee rows.
export interface FeeExtraRow {
  label: string;
  value: ReactNode;
  strong?: boolean;
}

/// Props for `FeeSummary`.
export interface FeeSummaryProps {
  model: FeeSummaryModel | undefined;
  variant: "details" | "review";
  /// `review` only: closing rows under the fee rows.
  extraRows?: readonly FeeExtraRow[];
  /// A figure on screen is being re-priced; marks the panel without resizing it.
  refreshing?: boolean;
  /// Omitted where the paying asset is not the user's choice.
  feeAsset?: FeeAssetChoice | undefined;
}

const DEFAULT_FRAC = 6;

function amountOf(amount: bigint, row: FeeRow, precision: number): string {
  const n = formatDecimalCompact(amount, row.asset.decimals, precision);
  const sign = row.sign === "minus" ? "−" : row.sign === "plus" ? "+" : "";
  return `${sign}${n} ${row.asset.symbol}`.trim();
}

/// The finest precision `asset`'s rows render at, so a derived total never reads coarser than its parts.
function derivedPrecision(rows: FeeRow[], asset: RowAsset): number {
  return rows.reduce(
    (n, r) =>
      r.amount === undefined || r.asset.symbol !== asset.symbol
        ? n
        : Math.max(n, compactFracDigits(r.amount, r.asset.decimals)),
    DEFAULT_FRAC,
  );
}

/// A figure, or a same-width placeholder while it is priced.
function Figure({
  row,
  className,
  precision,
}: {
  row: FeeRow;
  className: string;
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

/// The fee panel's rows, as a Details body (`details`) or a review list (`review`).
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
  const choosable = feeAsset && feeAsset.options.length > 1;

  const feeRows = feeRowsOf(model);
  const totalPrecision = model.total && derivedPrecision(feeRows, model.total.asset);
  const headlinePrecision = model.headline && derivedPrecision(feeRows, model.headline.asset);
  const extra = model.headlineExtra;
  const note = crossAssetNote(model);

  return (
    <div className="fees" aria-busy={refreshing || undefined}>
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
          {extra ? (
            <span className="fees__pulls">
              <Figure row={model.headline} className="fees__hero" precision={headlinePrecision} />
              <span>+</span>
              <Figure row={extra} className="fees__hero" />
            </span>
          ) : (
            <Figure row={model.headline} className="fees__hero" precision={headlinePrecision} />
          )}
        </div>
      ) : null}

      {note ? <p className="fees__note">{note}</p> : null}
    </div>
  );
}

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

/// The itemised, unsigned rows of a review screen.
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
              formatBaseFixed(row.amount, row.asset, REVIEW_FRAC)
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
