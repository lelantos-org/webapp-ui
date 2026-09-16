// The priced swap behind the form: `wallet.quoteSwap`, which asks MetaQuoter for
// the route and sizes every figure — what reaches the venue, the credited note,
// the fees — the way the swap will.
//
// A query rather than a click-driven mutation, so a quote never expires into a
// disabled submit button and a card asking for a manual refresh.
//
// Request volume is bounded by the same machinery the rest of the app uses: the
// amount is debounced as in `useFeePreview`, identical requests dedupe on the
// key, and the refresh runs on `pollInterval`, widening while the user is idle
// and stopping on a hidden tab.

import type { QuoteSwapOptions, SwapQuote } from "@lelantos-org/sdk";
import { skipToken, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useActiveChain } from "@/features/chain";
import { useWalletInstance } from "@/features/wallet";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { usePolling } from "@/shared/query/cadence";
import { queryKeys } from "@/shared/query/keys";

/// How long a quote is honoured before the form refuses to submit against it.
/// Exported so the form's age counter and this module's refresh cadence stay in
/// step.
export const QUOTE_STALE_SECS = 30;

/// How far ahead of expiry to refresh, so the common case is a quote that
/// never visibly goes stale rather than one that recovers from having done so.
const REFRESH_LEAD_SECS = 5;
const REFRESH_MS = (QUOTE_STALE_SECS - REFRESH_LEAD_SECS) * 1000;

/// Matches `useFeePreview`. Without it, every keystroke is its own request and
/// its own cache entry.
const DEBOUNCE_MS = 300;

/// The query result plus `stale`: true while the debounce is catching up with
/// the request the form is holding.
///
/// While `stale` is set, `data` describes an earlier amount or pair, and the
/// submit must treat it as absent: a quote binds a route into the proof, so one
/// fetched for a different amount is the wrong route.
///
/// `swap` itself refuses a quote whose figures have moved (`QUOTE_STALE`); the
/// form re-quotes on that refusal (`useSwap`), as it does on this age limit.
export type QuoteResult = UseQueryResult<SwapQuote> & { stale: boolean };

/// Quote for `request`, or nothing when there is not yet a complete one.
///
/// `undefined` disables the query outright, which is how the form says the
/// pair is incomplete, the assets match, or the amount does not validate.
export function useSwapQuote(request: QuoteSwapOptions | undefined): QuoteResult {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const pinned = usePinnedRequest(request);
  const settled = useDebouncedValue(pinned, DEBOUNCE_MS);
  const stale = settled !== pinned;

  const query = useQuery<SwapQuote>({
    // Per chain and wallet as well as per trade: asset ids name different tokens
    // on another chain, and the quote is sized against this wallet's relayer.
    queryKey: swapQuoteKey(chainId, wallet?.address, settled),
    queryFn:
      settled === undefined || !wallet
        ? skipToken
        : ({ signal }) => wallet.quoteSwap({ ...settled, signal }),
    ...usePolling(REFRESH_MS),
    // Under the refresh interval, so returning to the tab does not buy a quote
    // the running refresh was about to fetch.
    staleTime: REFRESH_MS,
    // Stated, because the result is spread into `QuoteResult` below and a spread
    // reads every property on react-query's tracking proxy, subscribing this
    // observer to all of them. `SwapForm` reads exactly these three; `refetch`
    // is stable and needs no subscription. `isFetching` is genuinely wanted here
    // — it drives the "quoting…" state and the refresh button's spinner.
    notifyOnChangeProps: ["data", "error", "isFetching"],
  });

  return useMemo(() => ({ ...query, stale }) as QuoteResult, [query, stale]);
}

/// The same object for as long as its contents are unchanged.
///
/// The form rebuilds the request on every render and `useDebouncedValue` keys on
/// identity, so feeding it the raw object restarts the timer each render and the
/// state it sets causes the next one: the value never settles, the component
/// re-renders on a 300ms loop, and each pass buys a quote. Pinning the object to
/// its value gives the debounce the identity it assumes.
function usePinnedRequest(request: QuoteSwapOptions | undefined): QuoteSwapOptions | undefined {
  const key = requestKey(request);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is `request` flattened; depending on the object reintroduces the loop described above
  return useMemo(() => request, [key]);
}

/// The request flattened to a string, serving as both its cache key and its
/// identity.
///
/// A string rather than an array of parts, because react-query hashes keys with
/// `JSON.stringify`, which throws on the `bigint` fields, and because the memo
/// above needs a value a dependency array can compare with `Object.is`.
function requestKey(r: QuoteSwapOptions | undefined): string {
  if (!r) return "none";
  const side = r.gross === undefined ? "net" : "gross";
  const amount = r.gross ?? r.net;
  const figure = typeof amount === "object" ? `base:${amount.baseUnits}` : String(amount);
  return [String(r.assetIn), String(r.assetOut), side, figure, String(r.slippageBps)].join("|");
}

/// The quote's cache key: the trade, on this chain, for this wallet.
export function swapQuoteKey(
  chainId: bigint,
  account: string | undefined,
  request: QuoteSwapOptions | undefined,
) {
  return queryKeys.swapQuote(`${chainId}|${account ?? "none"}|${requestKey(request)}`);
}
