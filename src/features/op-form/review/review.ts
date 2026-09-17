import { type FeeSummaryModel, REVIEW_FRAC, type RowAsset, sumByAsset } from "@/features/fees";
import { formatAssetFixed, formatBaseFixed } from "@/shared/lib/format/asset";
import { amountInWords } from "@/shared/lib/format/words";
import type { AssetMeta } from "../amount/amount-validation";

/// What leaves the shielded balance per asset (amount plus relayer fee), or `undefined` while unpriced.
export function leavesBalance(
  model: FeeSummaryModel | undefined,
): { amount: bigint; asset: RowAsset }[] | undefined {
  if (!model) return undefined;
  const parts = model.rows.filter((r) => r.key === "amount" || r.key === "relayer");
  if (parts.some((r) => r.amount === undefined)) return undefined;
  return sumByAsset(parts);
}

/// `leavesBalance` as a label: "250.00 USDC + 0.0001 ETH", or "—" while unknown.
export function leavesBalanceLabel(model: FeeSummaryModel | undefined): string {
  const groups = leavesBalance(model);
  if (!groups || groups.length === 0) return "—";
  return groups.map((g) => formatBaseFixed(g.amount, g.asset, REVIEW_FRAC)).join(" + ");
}

/// The model's headline (a withdraw's "They receive"), or "—" while unpriced. The relayer fee is not subtracted.
export function headlineLabel(model: FeeSummaryModel | undefined): string {
  const h = model?.headline;
  if (!h || h.amount === undefined) return "—";
  return formatBaseFixed(h.amount, h.asset, REVIEW_FRAC);
}

/// The review's lead figure and the same figure in words, both from the parsed amount.
export function reviewFigure(
  amount: bigint,
  meta: AssetMeta,
  symbol: string = meta.symbol ?? "",
): { figure: string; words: string } {
  const figure = formatAssetFixed(amount, meta);
  return { figure, words: amountInWords(figure, symbol) };
}
