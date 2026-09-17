import type { QuoteSwapOptions, SwapQuote } from "@lelantos-org/sdk";
import { skipToken, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useActiveChain } from "@/features/chain";
import { useWalletInstance } from "@/features/wallet";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { usePolling } from "@/shared/query/cadence";
import { queryKeys } from "@/shared/query/keys";

/// How long a quote is honoured before the form refuses to submit against it.
export const QUOTE_STALE_SECS = 30;

const REFRESH_LEAD_SECS = 5;
const REFRESH_MS = (QUOTE_STALE_SECS - REFRESH_LEAD_SECS) * 1000;

const DEBOUNCE_MS = 300;

/// The query plus `stale`: while set, `data` is for an earlier request and must not be submitted.
export type QuoteResult = UseQueryResult<SwapQuote> & { stale: boolean };

/// Debounced, polled `quoteSwap` for `request`; `undefined` disables the query.
export function useSwapQuote(request: QuoteSwapOptions | undefined): QuoteResult {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const pinned = usePinnedRequest(request);
  const settled = useDebouncedValue(pinned, DEBOUNCE_MS);
  const stale = settled !== pinned;

  const query = useQuery<SwapQuote>({
    queryKey: swapQuoteKey(chainId, wallet?.address, settled),
    queryFn:
      settled === undefined || !wallet
        ? skipToken
        : ({ signal }) => wallet.quoteSwap({ ...settled, signal }),
    ...usePolling(REFRESH_MS),
    staleTime: REFRESH_MS,
    // Explicit: the spread below would otherwise subscribe to every tracked property.
    notifyOnChangeProps: ["data", "error", "isFetching"],
  });

  return useMemo(() => ({ ...query, stale }) as QuoteResult, [query, stale]);
}

/// `request`, stable by value; a fresh object each render would loop the debounce and buy quotes.
function usePinnedRequest(request: QuoteSwapOptions | undefined): QuoteSwapOptions | undefined {
  const key = requestKey(request);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is `request` flattened; depending on the object reintroduces the loop described above
  return useMemo(() => request, [key]);
}

/// The request as a string key (`JSON.stringify` throws on its bigints).
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
