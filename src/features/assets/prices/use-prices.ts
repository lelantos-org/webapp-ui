import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { env } from "@/config/env";
import { useActiveChain } from "@/features/chain";
import { createLogger } from "@/shared/lib/logger";
import { usePolling } from "@/shared/query/cadence";
import { queryKeys } from "@/shared/query/keys";
import { type PriceMap, type PricesResponse, pricesResponse, toPriceMap } from "./prices";

const log = createLogger("prices");

const PRICE_POLL_MS = 120_000;

const PRICE_TIMEOUT_MS = 10_000;

const EMPTY: PriceMap = new Map();

async function fetchPrices(): Promise<PricesResponse> {
  const res = await fetch(`${env.registryUrl}/v1/prices`, {
    signal: AbortSignal.timeout(PRICE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`prices: ${res.status}`);
  return pricesResponse.parse(await res.json());
}

/// USD prices for the active chain's tokens. Any failure degrades to an empty map.
export function usePrices(): PriceMap {
  const { chainId } = useActiveChain();

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
