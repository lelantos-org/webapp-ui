// Spot USD prices for the registered assets, from protocol-webserver's
// `/v1/prices`.
//
// The registry rather than the relayer: a price is a property of the token,
// identical for every caller and for every relayer serving the chain, so it
// belongs with the catalog that lists the token. A self-hosted relayer has no
// business stating what WETH is worth.
//
// A separate query from the chain registry: `ChainProvider` holds
// `["chain-registry"]` at `staleTime: Infinity` because chain config does not
// change, while a price does, so prices get their own route and cadence. See the
// `PricesResponse` doc comment on the registry side.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { env } from "@/config/env";
import { useActiveChain } from "@/features/chain";
import { createLogger } from "@/shared/lib/logger";
import { usePolling } from "@/shared/query/cadence";
import { queryKeys } from "@/shared/query/keys";
import { type PriceMap, type PricesResponse, pricesResponse, toPriceMap } from "./prices";

const log = createLogger("prices");

/// How long the registry may hold a body (`max-age=60`) plus room for the
/// upstream provider's own TTL. Polling faster only re-reads the same cache.
const PRICE_POLL_MS = 120_000;

/// Bound on a stalled registry, matching the registry fetch in
/// `config/chains/registry.ts`.
const PRICE_TIMEOUT_MS = 10_000;

const EMPTY: PriceMap = new Map();

async function fetchPrices(): Promise<PricesResponse> {
  const res = await fetch(`${env.registryUrl}/v1/prices`, {
    signal: AbortSignal.timeout(PRICE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`prices: ${res.status}`);
  return pricesResponse.parse(await res.json());
}

/// USD prices for the active chain's tokens.
///
/// Never surfaces an error to the caller. An unreachable registry, an
/// unreachable provider, and a malformed body all degrade to an empty map, which
/// renders as no USD; balances, forms and totals work without it.
export function usePrices(): PriceMap {
  const { chainId } = useActiveChain();

  // Not scoped to the chain: the body covers every chain the deployment serves,
  // so a chain-scoped key would refetch the same document on each network switch.
  const query = useQuery({
    queryKey: queryKeys.prices(),
    queryFn: fetchPrices,
    staleTime: 60_000,
    ...usePolling(PRICE_POLL_MS),
  });

  const rows = query.data?.prices;
  const error = query.error;

  return useMemo(() => {
    if (error) {
      log.warn("no prices; rendering balances without USD", { error });
      return EMPTY;
    }
    if (!rows) return EMPTY;
    return toPriceMap(rows, chainId);
  }, [rows, error, chainId]);
}
