import type { SwapQuote } from "@lelantos-org/sdk";
import { useCallback, useEffect } from "react";
import { usePageVisible } from "@/shared/hooks/use-page-visible";
import { useIsIdle } from "@/shared/lib/idle";
import { type QuoteRequestInput, quoteRequest } from "./quote-request";
import { useQuoteAge } from "./use-quote-age";
import { useSwapQuote } from "./use-swap-quote";

export interface SwapQuoteState {
  /// The quote to submit against, or `undefined` while none matches the form's trade.
  quote: SwapQuote | undefined;
  ageSecs: number | undefined;
  stale: boolean;
  quoting: boolean;
  /// A request is in flight (the refresh spinner).
  refreshing: boolean;
  error: Error | null;
  /// The last request failed and nothing is being fetched to replace it.
  failed: boolean;
  /// Stable across renders.
  refresh(): void;
}

export function useSwapQuoteState(input: QuoteRequestInput): SwapQuoteState {
  const request = quoteRequest(input);
  const quoteQ = useSwapQuote(request);
  // Withheld while debouncing: `data` is for an earlier amount and would prove the wrong route.
  const quote = quoteQ.stale ? undefined : quoteQ.data;
  const { ageSecs, stale } = useQuoteAge(quote);
  const quoting = quoteQ.isFetching || (request !== undefined && quoteQ.stale);
  const { refetch } = quoteQ;
  const refresh = useCallback(() => void refetch(), [refetch]);

  // An expired quote re-prices itself while someone is at the page. Polling is paused in a hidden
  // tab and widened when idle, so there the refresh waits for them to come back.
  const visible = usePageVisible();
  const idle = useIsIdle();
  const attended = visible && !idle;
  useEffect(() => {
    if (stale && attended) refresh();
  }, [stale, attended, refresh]);

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
