// Public surface of the `op-form` feature: the kit every shielded-op form is
// built from.
//
// The frame (`ActionForm`), the amount/recipient/review building blocks, and the
// pure logic behind them: parsing an amount against an asset's decimals and
// scale, the balance hints, the spend-block reasons, and the field schemas each
// flow assembles its own form schema from. Its own feature rather than part of
// any one flow because shield, send, unshield, swap and send-by-link all build
// out of it; nothing here imports a flow, and it knows how an op is performed
// only through `features/ops`.

export { ActionForm } from "./ActionForm";
export { AmountHero, AssetPill } from "./AmountHero";
export { AssetSelectPill } from "./AssetSelectPill";
export type { AmountValidation, AssetMeta } from "./amount-validation";
export {
  depositMaxAmount,
  NO_META,
  parseAmountSafe,
  validateDepositAmount,
} from "./amount-validation";
export { BoundaryLine } from "./BoundaryLine";
export { MaxNotice } from "./MaxNotice";
export { RecipientField } from "./RecipientField";
export { ReviewPanel } from "./ReviewPanel";
export { headlineLabel, leavesBalanceLabel } from "./review";
export { SpendFeeSummary, SpendScreenHeader } from "./SpendParts";
export {
  amountField,
  asEthField,
  assetField,
  defaultAssetField,
  evmAddressField,
  isEvmAddress,
  isShieldedAddress,
  shieldedAddressField,
} from "./schemas";
export type { AmountReadiness, FeeReadiness, SubmitBlock, WalletReadiness } from "./submit-block";
export {
  amountBlock,
  blockedBy,
  feeBlockTail,
  feePendingBlock,
  feeProblemBlock,
  SUBMIT_OPEN,
  walletReadinessBlock,
} from "./submit-block";
export { useActionForm, useActionSubmit } from "./use-action-form";
export { useSpendAmount } from "./use-spend-amount";
export { useSpendForm } from "./use-spend-form";
