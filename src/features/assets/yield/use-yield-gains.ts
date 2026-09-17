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

const SERIES_STALE_MS = 15 * 60 * 1000;

/// The chain's recorded index history, keyed by chain alone so no wallet data reaches the request.
function useYieldIndexSeries(): YieldIndexSeries {
  const chain = useActiveChain();
  const query = useQuery({
    queryKey: queryKeys.yieldIndex(chain.chainId),
    staleTime: SERIES_STALE_MS,
    queryFn: ({ signal }) => fetchYieldIndex(env.registryUrl, chain.chainId, signal),
  });
  return query.data ?? NO_SERIES;
}

/// Unrealised yield per asset for the connected wallet. Failures degrade to absent entries.
export function useYieldGains(): YieldGains {
  const notes = useWalletState().data?.notes;
  const chain = useActiveChain();
  const series = useYieldIndexSeries();

  return useMemo(() => {
    if (notes === undefined) return NO_GAINS;
    // Never fetch per note block: the set of blocks asked about would reveal the wallet's notes.
    return computeGains(notes, chain.tokens, (asset, block) =>
      indexAtBlock(series.get(asset) ?? [], block),
    );
  }, [notes, series, chain.tokens]);
}
