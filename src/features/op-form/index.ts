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

export { AmountHero } from "./amount/AmountHero";
export { AssetPill, AssetSelectPill } from "./amount/AssetPill";
export type { AmountValidation, AssetMeta } from "./amount/amount-validation";
export {
  depositMaxAmount,
  NO_META,
  parseAmountSafe,
  validateDepositAmount,
} from "./amount/amount-validation";
export { MaxNotice } from "./amount/MaxNotice";
export { useSpendAmount } from "./amount/use-spend-amount";
export { ActionForm } from "./frame/ActionForm";
export { BoundaryLine } from "./frame/BoundaryLine";
export { useActionForm, useActionSubmit } from "./frame/use-action-form";
export { RecipientField } from "./recipient/RecipientField";
export { ReviewPanel } from "./review/ReviewPanel";
export { headlineLabel, leavesBalanceLabel } from "./review/review";
export { SpendScreenHeader } from "./review/SpendScreenHeader";
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
export type {
  AmountReadiness,
  FeeReadiness,
  SubmitBlock,
  WalletReadiness,
} from "./submit/submit-block";
export {
  amountBlock,
  blockedBy,
  ENTER_AMOUNT_REASON,
  feeBlockTail,
  feePendingBlock,
  feeProblemBlock,
  SUBMIT_OPEN,
  walletReadinessBlock,
} from "./submit/submit-block";
export { spendHeroProps, useSpendForm } from "./use-spend-form";
