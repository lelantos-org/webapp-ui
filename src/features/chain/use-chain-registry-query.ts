import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type ChainEntry, loadChainRegistry, readCachedChainRegistry } from "@/config/chains";
import { queryKeys } from "@/shared/query/keys";

/// The chain registry as a query: fetched once a wallet is connected, painted
/// from the cached copy meanwhile.
///
/// `enabled` is the connection. No backend is contacted before the user connects
/// a wallet or a passkey, so a visitor who only reads the landing page leaves no
/// trace on the services; until then the registry is whatever this browser
/// cached last, or nothing.
export function useChainRegistryQuery(enabled: boolean): UseQueryResult<ChainEntry[]> {
  // Read once per mount rather than per render: this touches localStorage and
  // runs a zod parse, and its result cannot change while the tab is open.
  const [cached] = useState(readCachedChainRegistry);

  return useQuery({
    queryKey: queryKeys.chainRegistry(),
    queryFn: loadChainRegistry,
    enabled,
    // `placeholderData` rather than `initialData`. Placeholder data is never
    // treated as cached, so the fetch still runs once enabled and the
    // `staleTime` applies only to the services' response; `initialData` would
    // combine with that staleTime to pin a potentially months-old registry for
    // the life of the tab.
    //
    // With anything cached, a connect proceeds on the cached chains at once
    // rather than holding a spinner for a full round-trip. Nothing cached means
    // no placeholder at all, so the key is left out.
    ...(cached ? { placeholderData: cached } : {}),
    // The set of deployed chains does not change under a running tab, but the
    // payload is more than identity: each yield asset carries `index` and
    // protocol-webserver's rate estimate, which it re-measures on its own schedule. An
    // infinite `staleTime` would pin both at whatever they were when the tab
    // opened, so a rate labelled "over the last 7 days" could be a week old
    // itself. Long enough that a herd of tabs does not poll the registry, short
    // enough that a figure on screen is one protocol-webserver still stands behind.
    staleTime: 10 * 60 * 1000,
    // A connected session is gated on this, so a single failed attempt should
    // not require a page reload; the wallet card's retry covers the remaining
    // cases.
    retry: 2,
  });
}
