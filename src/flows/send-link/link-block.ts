import {
  type AmountReadiness,
  amountBlock,
  blockedBy,
  type FeeReadiness,
  feePendingBlock,
  feeProblemBlock,
  SUBMIT_OPEN,
  type SubmitBlock,
  type WalletReadiness,
  walletReadinessBlock,
} from "@/features/op-form";

export interface LinkBlockInput extends WalletReadiness, AmountReadiness, FeeReadiness {
  hasAsset: boolean;
  /// The vault is full and the record the new link would drop is not exported.
  vaultFull: boolean;
  /// The private-channel acknowledgement is ticked.
  acknowledged: boolean;
}

/// Why "Create link" is disabled, and the sentence under it.
export function linkSubmitBlock(input: LinkBlockInput): SubmitBlock {
  return (
    walletReadinessBlock("sending", input) ??
    (input.hasAsset ? undefined : blockedBy("No assets on this network")) ??
    amountBlock(input) ??
    (input.vaultFull
      ? blockedBy("Export your links first — this one would drop the oldest")
      : undefined) ??
    feeProblemBlock(input.feeBlock) ??
    (input.acknowledged
      ? undefined
      : blockedBy("Tick the box to confirm you'll share it privately")) ??
    feePendingBlock(input.feePending) ??
    SUBMIT_OPEN
  );
}
