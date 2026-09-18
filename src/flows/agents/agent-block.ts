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

export interface AgentBlockInput extends WalletReadiness, AmountReadiness, FeeReadiness {
  hasAsset: boolean;
  /// The agent has been given a name.
  named: boolean;
  /// The list is full and funding another would drop the oldest record's key.
  listFull: boolean;
}

/// Why "Fund agent" is disabled, and the sentence under it.
export function agentSubmitBlock(input: AgentBlockInput): SubmitBlock {
  return (
    walletReadinessBlock("sending", input) ??
    (input.hasAsset ? undefined : blockedBy("No assets on this network")) ??
    (input.named ? undefined : blockedBy("Name the agent")) ??
    amountBlock(input) ??
    (input.listFull
      ? blockedBy("Sweep and forget an agent first — this one would drop the oldest")
      : undefined) ??
    feeProblemBlock(input.feeBlock) ??
    feePendingBlock(input.feePending) ??
    SUBMIT_OPEN
  );
}
