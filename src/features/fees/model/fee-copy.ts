// The fee summary as words: the one line a collapsed Details row shows, and the
// cross-asset note.

import { formatBaseFixed } from "@/shared/lib/format/asset";
import { type FeeSummaryModel, feeRowsOf, sumByAsset } from "./fee-summary";

/// A fee figure for a one-line summary: two places at least, six at most.
const LINE_FRAC = 6;

/// Review figures: two places at least, eight at most — the precision the
/// review's fee rows are set at, so a closing row never reads coarser than the
/// rows above it.
export const REVIEW_FRAC = 8;

export interface FeeLineOptions {
  /// The mobile form: "Fees 0.25 USDC · in USDC".
  short?: boolean | undefined;
}

/// The resolved answer to "what does this cost", as the one line a collapsed
/// Details row shows: "Total fees 0.25 USDC · paid in USDC".
///
/// "Paid in" names the asset the relayer is paid in, since that is the choice the
/// user can change; with no relayer row it names the asset being moved, which
/// is what the protocol fee comes out of.
///
/// Four shapes:
///   - nothing typed               → "—"
///   - a charge still being priced → "Working out the fee…" (short "Fees…")
///   - no charge at all            → "No fees"
///   - a cross-asset fee           → both figures, joined with "+", since
///                                   adding two tokens' base units means nothing
export function feeLine(
  model: FeeSummaryModel | undefined,
  { short = false }: FeeLineOptions = {},
): string {
  if (!model) return "—";
  const fees = feeRowsOf(model);
  if (fees.length === 0) return "No fees";
  if (fees.some((r) => r.amount === undefined)) return short ? "Fees…" : "Working out the fee…";

  // Grouped per asset, so a withdraw paying its relayer in ETH reads
  // "1.25 USDC + 0.0001 ETH" rather than listing each row.
  const groups = sumByAsset(fees);
  const figures = groups.map((g) => formatBaseFixed(g.amount, g.asset, LINE_FRAC)).join(" + ");
  const payAsset = (fees.find((r) => r.key === "relayer") ?? fees[0])?.asset.symbol ?? "";
  const paid =
    groups.length > 1 ? (short ? "relayer in" : "relayer paid in") : short ? "in" : "paid in";
  return `${short ? "Fees" : "Total fees"} ${figures} · ${paid} ${payAsset}`;
}

/// The line saying the relayer is paid from another balance, or `undefined`
/// where that is not true.
///
/// Only for a cross-asset fee: a same-asset fee comes out of the spend's own
/// change, and saying otherwise would contradict the fee rows. Stated once
/// because the fee panel, Send's footnote and Unshield's all say it.
///
/// A deposit's is pulled from the public wallet, beside the amount rather than
/// instead of it, and "your balance" there would read as the shielded one.
export function crossAssetNote(model: FeeSummaryModel | undefined): string | undefined {
  if (!model?.crossAsset) return undefined;
  const symbol = model.rows.find((r) => r.key === "relayer")?.asset.symbol;
  if (!symbol) return undefined;
  return model.headlineExtra
    ? `The relayer is paid with ${symbol} from your wallet, on top of the amount above.`
    : `The relayer is paid from your ${symbol} balance, not the amount above.`;
}
