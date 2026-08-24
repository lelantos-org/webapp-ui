// The MetaQuoter route behind the swap form.
//
// A query rather than the mutation this used to be. The mutation existed to
// keep quoting behind an explicit click — "auto-fetch on every keystroke would
// hammer MetaQuoter rate limits" — but the cost of that was a two-step flow
// whose quote then expired at 30s into a disabled submit button and a card
// asking for a manual refresh.
//
// The rate-limit worry is about an unthrottled fetch, not about auto-fetching
// as such, and a query answers it with the machinery the rest of the app
// already uses for exactly this: the amount is debounced as `useFeePreview`
// debounces its own, identical requests dedupe on the key, and the refresh
// runs on `pollInterval`, so it widens while the user is idle and stops
// entirely on a hidden tab. An unattended form now costs less than one left
// sitting with a stale quote and a button the user will click anyway.

import { fetchSwapQuote, type SwapQuote, type SwapQuoteRequest } from "@lelantos-org/sdk/quoter";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { env } from "@/config/env";
import { pollInterval, useIsIdle } from "@/shared/lib/activity";
import { useDebouncedValue } from "@/shared/lib/use-debounced-value";

export type QuoteRequest = SwapQuoteRequest;

/// How long a quote is honoured before the form refuses to submit against it.
/// Exported so the form's age counter and this module's refresh cadence cannot
/// drift apart.
export const QUOTE_STALE_SECS = 30;

/// How far ahead of expiry to refresh, so the common case is a quote that
/// never visibly goes stale rather than one that recovers from having done so.
const REFRESH_LEAD_SECS = 5;
const REFRESH_MS = (QUOTE_STALE_SECS - REFRESH_LEAD_SECS) * 1000;

/// Matches `useFeePreview`. Without it every keystroke is its own request and
/// its own cache entry.
const DEBOUNCE_MS = 300;

/// The query result plus `stale`: true while the debounce is catching up with
/// the request the form is holding.
///
/// While `stale` is set, `data` describes an earlier amount or pair. The submit
/// must treat it as absent — a quote binds a route into the proof, and one
/// fetched for a different amount is the wrong route.
export type QuoteResult = UseQueryResult<SwapQuote> & { stale: boolean };

/// Quote for `request`, or nothing when there is not yet a complete one.
///
/// `undefined` disables the query outright, which is how the form says the
/// pair is incomplete, the assets match, or the amount does not validate.
export function useSwapQuote(request: QuoteRequest | undefined): QuoteResult {
  const idle = useIsIdle();
  const pinned = usePinnedRequest(request);
  const settled = useDebouncedValue(pinned, DEBOUNCE_MS);
  const stale = settled !== pinned;

  const query = useQuery<SwapQuote>({
    queryKey: ["swap-quote", requestKey(settled)],
    enabled: settled !== undefined,
    queryFn: () => {
      const baseUrl = env.metaquoterUrl;
      if (!baseUrl) throw new Error("VITE_METAQUOTER_URL not configured");
      if (!settled) throw new Error("not ready");
      return fetchSwapQuote(baseUrl, settled);
    },
    refetchInterval: () => pollInterval(REFRESH_MS, idle),
    refetchIntervalInBackground: false,
    // Under the refresh interval, so switching tabs and coming back does not
    // buy a quote the running refresh was about to fetch anyway.
    staleTime: REFRESH_MS,
  });

  return useMemo(() => ({ ...query, stale }) as QuoteResult, [query, stale]);
}

/// The same object for as long as its contents are unchanged.
///
/// The form rebuilds the request on every render, and `useDebouncedValue` keys
/// on identity: fed the raw object it restarts its timer each render, and the
/// state it then sets causes the next render — so the value never settles, the
/// component re-renders on a 300ms loop forever, and each pass buys a quote.
/// Pinning the object to its value is what makes "unchanged" mean what the
/// debounce assumes it means.
function usePinnedRequest(request: QuoteRequest | undefined): QuoteRequest | undefined {
  const key = requestKey(request);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` *is* `request` flattened — depending on the object instead is the bug described above
  return useMemo(() => request, [key]);
}

/// The request flattened to a string — its cache key and its identity both.
///
/// A string rather than an array of parts because react-query hashes keys with
/// `JSON.stringify`, which throws on the two `bigint` fields, and because the
/// memo above needs a value a dependency array can compare with `Object.is`.
function requestKey(r: QuoteRequest | undefined): string {
  if (!r) return "none";
  return [r.chainId, r.tokenIn, r.tokenOut, r.amountIn, r.slippageBps].join("|");
}
