import {
  type AmountReadiness,
  amountBlock,
  blockedBy,
  type FeeReadiness,
  feeBlockTail,
  NO_ASSETS_REASON,
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
    (s.hasPair ? undefined : blockedBy(NO_ASSETS_REASON)) ??
    amountBlock(s) ??
    quoteBlock(s) ??
    feeBlockTail(s) ??
    SUBMIT_OPEN
  );
}

function quoteBlock(s: SwapSubmitState): SubmitBlock | undefined {
  // A refresh behind a quote that still stands does not hold the swap.
  if (s.quoting && !s.hasQuote) return blockedBy("Fetching a quote…");
  if (s.quoteStale) {
    return blockedBy(s.quoting ? "Refreshing the quote…" : "The quote expired — refresh it");
  }
  if (s.quoteFailed) return blockedBy("Couldn't get a quote — try again");
  if (!s.hasQuote) return blockedBy("Waiting for a quote");
  return undefined;
}
