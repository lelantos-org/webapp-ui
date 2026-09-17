import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type ChainEntry, loadChainRegistry, readCachedChainRegistry } from "@/config/chains";
import { queryKeys } from "@/shared/query/keys";

/// The chain registry query, fetched only once `enabled` (connected) and painted from cache meanwhile.
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
