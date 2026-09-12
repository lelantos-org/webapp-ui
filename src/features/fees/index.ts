// Public surface of the `fees` feature.
//
// Quoting and displaying what a shielded op costs: the protocol's own per-asset
// rate, the relayer's fee and the asset it may be paid in. Its own feature
// rather than part of `features/ops` or a flow because every op that costs
// anything needs it — deposit, transfer, withdraw and swap — and none of it
// depends on how the op is then performed: nothing here imports `ops` or a flow.

export { FeeDetails } from "./FeeDetails";
export { FeeSummary } from "./FeeSummary";
export type { FeeBlock } from "./fee-block";
export { feeBlockReason } from "./fee-block";
export { crossAssetNote, feeLine, feeTotalUsd } from "./fee-copy";
export type { FeeRow, FeeSummaryModel, RowAsset } from "./fee-summary";
export { allPriced, feeLegFor, feeRowsOf, feeSummary, sumByAsset } from "./fee-summary";
export type { FeePanel } from "./use-fee-panel";
export { useFeePanel } from "./use-fee-panel";
export {
  feeIncoming,
  fetchAssetFeeInputs,
  settledFee,
  shownFee,
  useAssetFeeBps,
  useFeePreview,
} from "./use-fee-preview";
export type { FeeQuoteResult } from "./use-fee-quote";
export { feeOptionFor, resolveFeeOption, useDepositFee, useFeeQuote } from "./use-fee-quote";
