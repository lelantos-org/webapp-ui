// Why the swap's submit button is disabled.
//
// Several independent conditions gate this button, and collapsing them into one
// dead control leaves the user to guess which one they are in — the quote
// counter is visible, but "typed too much" and "still fetching" look identical
// from the outside.

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

/// Ordering is the substance here, not the strings.
///
/// The wallet's own state first, as in `op-form/spend-block.ts`: against balances
/// that are stale or not yet counted, "enter an amount you hold" is a question
/// nobody can answer. Then the user's own input, because it is the only
/// condition they can act on directly. `quoting` precedes the missing-quote case
/// because a fetch in flight *is* why there is no quote yet, and reporting the
/// absence instead reads as a dead end. A stale quote likewise outranks absence:
/// one expired in place is a different situation from one that never arrived,
/// and it has a remedy the other lacks.
///
/// Fee problems come after the quote but do block (ux-findings #02): a
/// swap whose relayer cannot be paid would otherwise spend a full proof to learn
/// it.
export interface SwapSubmitState extends WalletReadiness, AmountReadiness, FeeReadiness {
  /// The network lists two assets to trade between.
  hasPair: boolean;
  hasQuote: boolean;
  /// A quote exists but has aged past `QUOTE_STALE_SECS`.
  quoteStale: boolean;
  /// A quote request is in flight, or the debounce has not caught up.
  quoting: boolean;
  /// The last quote request failed.
  quoteFailed: boolean;
}

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
