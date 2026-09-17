import {
  type AmountReadiness,
  amountBlock,
  blockedBy,
  type FeeReadiness,
  feeBlockTail,
  SUBMIT_OPEN,
  type SubmitBlock,
  type WalletReadiness,
  walletReadinessBlock,
} from "@/features/op-form";

export interface SwapSubmitState extends WalletReadiness, AmountReadiness, FeeReadiness {
  /// The network lists two assets to trade between.
  hasPair: boolean;
  hasQuote: boolean;
  quoteStale: boolean;
  quoting: boolean;
  quoteFailed: boolean;
}

/// Why Swap is disabled: wallet, input, quote, then fee, in that order.
export function swapSubmitBlock(s: SwapSubmitState): SubmitBlock {
  return (
    walletReadinessBlock("swapping", s) ??
    (s.hasPair ? undefined : blockedBy("No assets on this network")) ??
    amountBlock(s) ??
    quoteBlock(s) ??
    feeBlockTail(s) ??
    SUBMIT_OPEN
  );
}

function quoteBlock(s: SwapSubmitState): SubmitBlock | undefined {
  if (s.quoting) return blockedBy("Fetching a quote…");
  if (s.quoteStale) return blockedBy("The quote expired — refresh it");
  if (s.quoteFailed) return blockedBy("Couldn't get a quote — try again");
  if (!s.hasQuote) return blockedBy("Waiting for a quote");
  return undefined;
}
