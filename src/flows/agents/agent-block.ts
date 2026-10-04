import {
  type AmountReadiness,
  type AmountValidation,
  amountBlock,
  blockedBy,
  type FeeReadiness,
  feeBlockTail,
  NO_ASSETS_REASON,
  pickAmountError,
  SUBMIT_OPEN,
  type SubmitBlock,
  type WalletReadiness,
  walletReadinessBlock,
} from "@/features/op-form";

export interface AgentBlockInput extends WalletReadiness, AmountReadiness, FeeReadiness {
  hasAsset: boolean;
  named: boolean;
  /// The list is full; funding another drops the oldest record's key.
  listFull: boolean;
}

/// Why "Fund agent" is disabled, and the sentence under it.
export function agentSubmitBlock(input: AgentBlockInput): SubmitBlock {
  return (
    walletReadinessBlock("sending", input) ??
    (input.hasAsset ? undefined : blockedBy(NO_ASSETS_REASON)) ??
    (input.named ? undefined : blockedBy("Name the agent")) ??
    amountBlock(input) ??
    (input.listFull
      ? blockedBy("Sweep and forget an agent first — this one would drop the oldest")
      : undefined) ??
    feeBlockTail(input) ??
    SUBMIT_OPEN
  );
}

export interface TopUpBlockInput extends WalletReadiness, AmountReadiness, FeeReadiness {
  hasAsset: boolean;
  /// Something is in the amount field.
  typed: boolean;
  validation: AmountValidation;
}

/// Why a top-up's Send is held. An empty row is held without a reason, and the row has no field
/// message of its own, so an amount over a limit is named here.
export function topUpSubmitBlock(input: TopUpBlockInput): SubmitBlock {
  if (!input.hasAsset) return blockedBy(NO_ASSETS_REASON);
  if (!input.typed) return blockedBy();
  return (
    walletReadinessBlock("sending", input) ??
    (input.amountValid
      ? undefined
      : blockedBy(input.amountReason ?? pickAmountError(undefined, input.validation))) ??
    feeBlockTail(input) ??
    SUBMIT_OPEN
  );
}
