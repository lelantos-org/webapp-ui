// The figures a review screen states that no other surface does.
//
// Pure, so the arithmetic a user confirms against is tested rather than read off
// a component.

import { type FeeSummaryModel, type RowAsset, sumByAsset } from "@/features/fees";
import { formatAssetFixed, formatBaseFixed } from "@/shared/lib/format/asset";
import { amountInWords } from "@/shared/lib/format/words";
import type { AssetMeta } from "./amount-validation";

/// Review figures: two places at least, eight at most — the precision the
/// review's fee rows are set at, so a closing row never reads coarser than the
/// rows above it.
const REVIEW_FRAC = 8;

/// What leaves the user's shielded balance, per asset, or `undefined` while any
/// part of it is unpriced.
///
/// The amount plus the relayer's fee. Not the protocol fee: on a withdraw it is
/// skimmed off the transparent leg, which is part of the amount already, and a
/// transfer has none. Grouped by asset because a cross-asset relayer fee draws
/// on a different balance, and adding two tokens' base units is meaningless.
export function leavesBalance(
  model: FeeSummaryModel | undefined,
): { amount: bigint; asset: RowAsset }[] | undefined {
  if (!model) return undefined;
  const parts = model.rows.filter((r) => r.key === "amount" || r.key === "relayer");
  if (parts.some((r) => r.amount === undefined)) return undefined;
  return sumByAsset(parts);
}

/// `leavesBalance` as the review's "Leaves your balance" value: "250.25 USDC",
/// or "250.00 USDC + 0.0001 ETH" for a relayer paid in another asset. "—" while
/// unknown; Confirm is held on `allPriced` meanwhile.
export function leavesBalanceLabel(model: FeeSummaryModel | undefined): string {
  const groups = leavesBalance(model);
  if (!groups || groups.length === 0) return "—";
  return groups.map((g) => formatBaseFixed(g.amount, g.asset, REVIEW_FRAC)).join(" + ");
}

/// The model's bottom line — a withdraw's "They receive" — or "—" while unpriced.
///
/// This is `feeSummary`'s headline, base less the protocol fee. The relayer fee
/// is funded from shielded change, so it does not come out of what the recipient
/// gets, and must not be subtracted here.
export function headlineLabel(model: FeeSummaryModel | undefined): string {
  const h = model?.headline;
  if (!h || h.amount === undefined) return "—";
  return formatBaseFixed(h.amount, h.asset, REVIEW_FRAC);
}

/// The review's lead figure and the same figure in words.
///
/// Both come from the parsed amount, not the text as typed, so they state exactly
/// what will be sent — a yield asset's circuit units can round a typed figure —
/// and the words are written from the figure itself so the two cannot disagree.
/// At least two places ("250.00"), and every significant digit after that.
export function reviewFigure(
  amount: bigint,
  meta: AssetMeta,
  symbol: string = meta.symbol ?? "",
): { figure: string; words: string } {
  const figure = formatAssetFixed(amount, meta);
  return { figure, words: amountInWords(figure, symbol) };
}
