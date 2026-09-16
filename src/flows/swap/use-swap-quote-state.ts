// The quote the swap form trades against, and everything the form says about it.
//
// The request, the debounced query behind it, the age counter and the flags the
// submit block and "You receive" read — joined here so the form holds one value
// rather than re-deriving `quoting` and `stale` beside its own fields.

import type { SwapQuote } from "@lelantos-org/sdk";
import { useCallback } from "react";
import { type QuoteRequestInput, quoteRequest } from "./quote-request";
import { useQuoteAge } from "./use-quote-age";
import { useSwapQuote } from "./use-swap-quote";

export interface SwapQuoteState {
  /// The quote to submit against, or `undefined` while none describes the trade
  /// the form holds.
  quote: SwapQuote | undefined;
  /// Seconds since `quote` was issued.
  ageSecs: number | undefined;
  /// `quote` has aged past `QUOTE_STALE_SECS`.
  stale: boolean;
  /// A request is in flight, or the debounce has not caught up.
  quoting: boolean;
  /// A request is in flight: the refresh control's own spinner.
  refreshing: boolean;
  error: Error | null;
  /// The last request failed and nothing is being fetched to replace it.
  failed: boolean;
  /// Stable across renders, so an effect may depend on it.
  refresh(): void;
}

export function useSwapQuoteState(input: QuoteRequestInput): SwapQuoteState {
  // The quote binds a route into the proof, so it is fetched for one exact
  // (pair, amount, slippage); see `quote-request.ts` for why `undefined` is the
  // load-bearing case.
  const request = quoteRequest(input);
  const quoteQ = useSwapQuote(request);
  // Suppressed while the debounce catches up, since `data` then describes an
  // earlier amount and submitting against it would prove the wrong route.
  const quote = quoteQ.stale ? undefined : quoteQ.data;
  const { ageSecs, stale } = useQuoteAge(quote);
  const quoting = quoteQ.isFetching || (request !== undefined && quoteQ.stale);
  const { refetch } = quoteQ;
  const refresh = useCallback(() => void refetch(), [refetch]);

  return {
    quote,
    ageSecs,
    stale,
    quoting,
    refreshing: quoteQ.isFetching,
    error: quoteQ.error,
    failed: !!quoteQ.error && !quoting,
    refresh,
  };
}
