import { formatBaseFixed } from "@/shared/lib/format/asset";
import { type FeeSummaryModel, feeRowsOf, sumByAsset } from "./fee-summary";

const LINE_FRAC = 6;

/// Fraction digits for review fee figures, matching the review's fee rows.
export const REVIEW_FRAC = 8;

/// Options for `feeLine`.
export interface FeeLineOptions {
  /// The mobile form: "Fees 0.25 USDC · in USDC".
  short?: boolean | undefined;
}

/// The collapsed Details line, e.g. "Total fees 0.25 USDC · paid in USDC"; cross-asset figures join with "+".
export function feeLine(
  model: FeeSummaryModel | undefined,
  { short = false }: FeeLineOptions = {},
): string {
  if (!model) return "—";
  const fees = feeRowsOf(model);
  if (fees.length === 0) return "No fees";
  if (fees.some((r) => r.amount === undefined)) return short ? "Fees…" : "Working out the fee…";

  const groups = sumByAsset(fees);
  const figures = groups.map((g) => formatBaseFixed(g.amount, g.asset, LINE_FRAC)).join(" + ");
  const payAsset = (fees.find((r) => r.key === "relayer") ?? fees[0])?.asset.symbol ?? "";
  const paid =
    groups.length > 1 ? (short ? "relayer in" : "relayer paid in") : short ? "in" : "paid in";
  return `${short ? "Fees" : "Total fees"} ${figures} · ${paid} ${payAsset}`;
}

/// The note that a cross-asset relayer fee comes from another balance, or `undefined`.
export function crossAssetNote(model: FeeSummaryModel | undefined): string | undefined {
  if (!model?.crossAsset) return undefined;
  const symbol = model.rows.find((r) => r.key === "relayer")?.asset.symbol;
  if (!symbol) return undefined;
  return model.headlineExtra
    ? `The relayer is paid with ${symbol} from your wallet, on top of the amount above.`
    : `The relayer is paid from your ${symbol} balance, not the amount above.`;
}
