// Public surface of the `fees` feature.
//
// Quoting and displaying what a shielded op costs: the protocol's own per-asset
// rate, the relayer's fee and the asset it may be paid in. Its own feature
// rather than part of `features/ops` or a flow because every op that costs
// anything needs it — deposit, transfer, withdraw and swap — and none of it
// depends on how the op is then performed: nothing here imports `ops` or a flow.

export type { FeeBlock } from "./model/fee-block";
export { feeBlockReason } from "./model/fee-block";
export { crossAssetNote, REVIEW_FRAC } from "./model/fee-copy";
export type { FeeSummaryModel, RowAsset } from "./model/fee-summary";
export {
  allPriced,
  feeLegFor,
  feeRowsOf,
  feeSummary,
  feeTotalUsd,
  sumByAsset,
} from "./model/fee-summary";
export { FeeDetails } from "./panel/FeeDetails";
export { FeeLineSummary } from "./panel/FeeLineSummary";
export { FeeSummary } from "./panel/FeeSummary";
export type { FeePanel } from "./panel/use-fee-panel";
export { useFeePanel, withSymbol } from "./panel/use-fee-panel";
export {
  feeIncoming,
  settledFee,
  shownFee,
  useAssetFeeBps,
  useFeePreview,
} from "./quote/use-fee-preview";
export { feeOptionFor, resolveFeeOption, useFeeQuote } from "./quote/use-fee-quote";
