// What the portfolio screens read: the shielded balances, the registry indexed
// by id, the prices and the yield gains.
//
// `PortfolioHero` and `AssetsCard` each assembled the same four reads and built
// the same index. The queries are shared, so reading them twice cost nothing;
// the index was built twice.

import { useMemo } from "react";
import type { RegisteredAsset } from "@/config/chains";
import type { PriceMap } from "./prices";
import { useRegisteredAssets } from "./registered-assets";
import { type AssetBalanceView, useBalances } from "./use-balances";
import { usePrices } from "./use-prices";
import { useYieldGains } from "./use-yield-gains";
import type { YieldGains } from "./yield-gains";

export interface Portfolio {
  /// The balances query itself, for its loading and error states.
  shielded: ReturnType<typeof useBalances>;
  /// One row per asset held, or `undefined` before the first sync lands.
  rows: AssetBalanceView[] | undefined;
  assets: readonly RegisteredAsset[];
  /// The registry by id. A single index rather than a linear `assets.find` per
  /// row per render; it also gives the rows stable prop identities, which is what
  /// makes memoising them effective.
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
