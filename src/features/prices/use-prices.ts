// Spot USD prices for the registered assets, from the relayer's `/v1/prices`.
//
// A separate query from the chain registry: `ChainProvider` holds
// `["chain-registry"]` at `staleTime: Infinity` because chain config does not
// change, while a price does, so prices get their own route and cadence. See the
// `PricesResponse` doc comment on the relayer side.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import { env } from "@/config/env";
import { useActiveChain } from "@/features/chain";
import { usePolling } from "@/shared/lib/activity";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("prices");

/// How long the relayer may hold a body (`max-age=60`) plus room for the
/// upstream provider's own TTL. Polling faster only re-reads the same cache.
const PRICE_POLL_MS = 120_000;

/// Bound on a stalled relayer, matching the registry fetch in `config/chains.ts`.
const PRICE_TIMEOUT_MS = 10_000;

const priceRow = z.object({
  chainId: z.number(),
  token: z.string(),
  priceUsd: z.number(),
  priceAt: z.number(),
});

/// Exported for tests; `usePrices` parses with it.
export const pricesResponse = z.object({ prices: z.array(priceRow) });

export type PriceRow = z.infer<typeof priceRow>;

/// One token's quote. `priceAt` is the provider's timestamp rather than the fetch
/// time, so a caller can age it.
export interface TokenPrice {
  priceUsd: number;
  priceAt: number;
}

/// Prices for the active chain, keyed by lowercased token address.
///
/// A token absent from the map has no known price: a local test token, or any
/// token on a chain the provider does not cover. That is distinct from zero, so
/// a caller must render nothing rather than `$0.00`.
export type PriceMap = ReadonlyMap<string, TokenPrice>;

const EMPTY: PriceMap = new Map();

async function fetchPrices(): Promise<z.infer<typeof pricesResponse>> {
  const res = await fetch(`${env.relayerUrl}/v1/prices`, {
    signal: AbortSignal.timeout(PRICE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`prices: ${res.status}`);
  return pricesResponse.parse(await res.json());
}

/// USD prices for the active chain's tokens.
///
/// Never surfaces an error to the caller. An unreachable relayer, an unreachable
/// provider, and a malformed body all degrade to an empty map, which renders as
/// no USD; balances, forms and totals work without it.
export function usePrices(): PriceMap {
  const { chainId } = useActiveChain();

  // Not scoped to the chain: the body covers every chain the relayer serves, so a
  // chain-scoped key would refetch the same document on each network switch.
  const query = useQuery({
    queryKey: ["asset-prices"],
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

/// Narrow the relayer's all-chains body to one chain, keyed for lookup.
///
/// The body covers every chain the relayer serves, and a token address is
/// meaningful only with its chain: the same address denotes a different asset
/// elsewhere, and two chains may list the same one. Dropping the other chains'
/// rows keeps a wallet from pricing a balance against another network.
///
/// Keys are lowercased because the registry's addresses are checksummed and the
/// relayer's are not; callers look up with `.toLowerCase()`.
export function toPriceMap(rows: readonly PriceRow[], chainId: bigint): PriceMap {
  const m = new Map<string, TokenPrice>();
  for (const r of rows) {
    if (BigInt(r.chainId) !== chainId) continue;
    m.set(r.token.toLowerCase(), { priceUsd: r.priceUsd, priceAt: r.priceAt });
  }
  return m;
}
