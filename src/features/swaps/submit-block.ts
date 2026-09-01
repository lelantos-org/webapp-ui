/// Why the swap's submit button is disabled.
///
/// Four independent conditions gate this button, and collapsing them into one
/// dead control leaves the user to guess which one they are in — the quote
/// counter is visible, but "typed too much" and "still fetching" look identical
/// from the outside.
///
/// Ordering is the substance here, not the strings. The user's own input comes
/// first because it is the only condition they can act on directly. `quoting`
/// precedes the missing-quote case because a fetch in flight *is* why there is
/// no quote yet, and reporting the absence instead reads as a dead end. A stale
/// quote likewise outranks absence: one expired in place is a different
/// situation from one that never arrived, and it has a remedy the other lacks.
export interface SwapSubmitState {
  /// The amount parses, is positive, and is within the balance.
  amountValid: boolean;
  hasQuote: boolean;
  /// A quote exists but has aged past `QUOTE_STALE_SECS`.
  quoteStale: boolean;
  /// A quote request is in flight, or the debounce has not caught up.
  quoting: boolean;
}

export interface SwapSubmitBlock {
  disabled: boolean;
  /// Absent when nothing blocks submission.
  reason?: string;
}

export function swapSubmitBlock(s: SwapSubmitState): SwapSubmitBlock {
  if (!s.amountValid) return { disabled: true, reason: "enter an amount you hold" };
  if (s.quoting) return { disabled: true, reason: "fetching a quote…" };
  if (s.quoteStale) return { disabled: true, reason: "the quote expired — refresh it" };
  if (!s.hasQuote) return { disabled: true, reason: "waiting for a quote" };
  return { disabled: false };
}
