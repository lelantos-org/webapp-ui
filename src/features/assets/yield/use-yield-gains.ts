// The React binding for `yield-index-client.ts` / `yield-gains.ts`.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { env } from "@/config/env";
import { useActiveChain } from "@/features/chain";
import { useWalletState } from "@/features/wallet";
import { queryKeys } from "@/shared/query/keys";
import { computeGains, NO_GAINS, type YieldGains } from "./yield-gains";
import {
  fetchYieldIndex,
  indexAtBlock,
  NO_SERIES,
  type YieldIndexSeries,
} from "./yield-index-client";

/// How long a fetched history is reused.
///
/// The sampler behind it writes every 30 minutes and the response carries its
/// own `max-age`, so this only bounds how often the query re-validates within a
/// session. A note's basis does not move once its block is in the series.
const SERIES_STALE_MS = 15 * 60 * 1000;

/// The chain's recorded index history.
///
/// Its own query, keyed by chain alone: the body is identical for every wallet,
/// so it is shared across every holder in the tab and cached by the browser
/// between them. Nothing about the connected wallet is in the key, which is the
/// property that keeps a note's blocks out of the request.
function useYieldIndexSeries(): YieldIndexSeries {
  const chain = useActiveChain();
  const query = useQuery({
    queryKey: queryKeys.yieldIndex(chain.chainId),
    staleTime: SERIES_STALE_MS,
    queryFn: ({ signal }) => fetchYieldIndex(env.registryUrl, chain.chainId, signal),
  });
  return query.data ?? NO_SERIES;
}

/// Unrealised yield per asset for the connected wallet.
///
/// Recomputed when the holdings or the series change, not on the balance poll's
/// cadence: `useWalletState` returns a fresh `notes` array only when a holding
/// actually moves. The fold is synchronous — every answer comes from the series
/// already fetched — so a recompute costs a binary search per note.
///
/// Never surfaces an error. Every failure mode — an unreachable registry, a note
/// older than the history, an asset with no yield — degrades to an absent or
/// partial entry, and the portfolio renders without it.
export function useYieldGains(): YieldGains {
  const notes = useWalletState().data?.notes;
  const chain = useActiveChain();
  const series = useYieldIndexSeries();

  // A `useMemo`, not a second query. The fold reaches no network — every answer
  // comes from `series`, which the query above already fetched — so wrapping it
  // in `useQuery` would only add a cache whose key has to restate every input —
  // and `series.size` is not enough of one: a refetch can add samples to assets
  // already present.
  return useMemo(() => {
    if (notes === undefined) return NO_GAINS;
    // Every answer comes from `series`, so a note whose block predates the
    // history is reported unknown rather than fetched for. That is what keeps a
    // wallet's blocks out of any request.
    return computeGains(notes, chain.tokens, (asset, block) =>
      indexAtBlock(series.get(asset) ?? [], block),
    );
  }, [notes, series, chain.tokens]);
}
