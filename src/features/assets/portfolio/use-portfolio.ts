import { useMemo } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { type AssetBalanceView, useBalances } from "../balances/use-balances";
import type { PriceMap } from "../prices/prices";
import { usePrices } from "../prices/use-prices";
import { useRegisteredAssets } from "../registry/registered-assets";
import { useYieldGains } from "../yield/use-yield-gains";
import type { YieldGains } from "../yield/yield-gains";

export interface Portfolio {
  /// The balances query itself, for its loading and error states.
  shielded: ReturnType<typeof useBalances>;
  /// One row per asset held, or `undefined` before the first sync lands.
  rows: AssetBalanceView[] | undefined;
  assets: readonly RegisteredAsset[];
  /// The registry by id, with stable identities so memoised rows skip re-renders.
  byId: ReadonlyMap<bigint, RegisteredAsset>;
  prices: PriceMap;
  gains: YieldGains;
}

export function usePortfolio(): Portfolio {
  const shielded = useBalances();
  const assets = useRegisteredAssets();
  const prices = usePrices();
  const gains = useYieldGains();
  const byId = useMemo(() => {
    const m = new Map<bigint, RegisteredAsset>();
    for (const a of assets) m.set(a.id, a);
    return m;
  }, [assets]);
  return { shielded, rows: shielded.data?.balances, assets, byId, prices, gains };
}
