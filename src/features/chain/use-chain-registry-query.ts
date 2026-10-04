import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type ChainEntry, loadChainRegistry, readCachedChainRegistry } from "@/config/chains";
import { queryKeys } from "@/shared/query/keys";

/// The chain registry query, fetched only once `enabled` (a wallet is connecting or connected) and
/// painted from cache meanwhile.
export function useChainRegistryQuery(enabled: boolean): UseQueryResult<ChainEntry[]> {
  const [cached] = useState(readCachedChainRegistry);

  return useQuery({
    queryKey: queryKeys.chainRegistry(),
    queryFn: loadChainRegistry,
    enabled,
    // Not `initialData`: with staleTime it would pin a possibly months-old registry for the tab's life.
    ...(cached ? { placeholderData: cached } : {}),
    // Finite: the payload carries yield rates that go stale.
    staleTime: 10 * 60 * 1000,
    retry: 2,
  });
}

export interface EarlyChainRegistry {
  /// The network copy has arrived: a chain missing now is one the deployment does not serve.
  loaded: boolean;
  failed: boolean;
}

/// Fetches the registry for a screen that needs it before any wallet connects, such as a claim
/// link naming its chain. `useChainRegistry` serves the result.
export function useEarlyChainRegistry(enabled: boolean): EarlyChainRegistry {
  const query = useChainRegistryQuery(enabled);
  return {
    loaded: query.isSuccess && !query.isPlaceholderData,
    failed: enabled && query.isError,
  };
}
