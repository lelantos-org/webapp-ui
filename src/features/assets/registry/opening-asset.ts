import { useCallback } from "react";
import { chainKey, type RegisteredAsset } from "@/config/chains";
import { useActiveChainOrUndefined } from "@/features/chain";
import type { AssetBalance } from "@/features/wallet";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore } from "@/shared/lib/storage/safe";
import { assetUsd, type PriceMap } from "../prices/prices";
import { findAsset } from "./registered-assets";

/// The asset the page's URL names (`?asset=<id>`), where the chain registers it.
export function askedAsset(
  assets: readonly RegisteredAsset[],
  search: string = window.location.search,
): string | undefined {
  const asked = new URLSearchParams(search).get("asset") ?? undefined;
  return findAsset(assets, asked)?.id.toString();
}

export interface HeldAssetInputs {
  assets: readonly RegisteredAsset[];
  balances: readonly Pick<AssetBalance, "asset" | "balance">[];
  prices: PriceMap;
  /// The asset last sent on this chain.
  lastUsed: string | undefined;
}

/// The holding a spend form opens on: the asset last sent if it is still held, else the largest
/// by dollar value, else the first held. `undefined` when nothing is held.
export function heldAsset({
  assets,
  balances,
  prices,
  lastUsed,
}: HeldAssetInputs): string | undefined {
  const held = assets.flatMap((asset) => {
    const balance = balances.find((b) => b.asset === asset.id)?.balance ?? 0n;
    return balance > 0n ? [{ asset, usd: assetUsd(balance, asset, prices) }] : [];
  });
  const last = held.find((h) => h.asset.id.toString() === lastUsed);
  // An unpriced holding cannot be ranked, so it sorts below every priced one; ties keep registry order.
  const [largest] = [...held].sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
  return (last ?? largest)?.asset.id.toString();
}

const lastAssetKey = (chainId: bigint) => `${LOCAL_KEYS.lastAssetPrefix}${chainKey(chainId)}`;

/// The asset last sent on the active chain from this browser.
export function useLastUsedAsset(): string | undefined {
  const chain = useActiveChainOrUndefined();
  return chain ? localStore.get(lastAssetKey(chain.chainId)) : undefined;
}

/// Records an asset as the one last sent on the active chain.
export function useRememberAsset(): (asset: bigint) => void {
  const chainId = useActiveChainOrUndefined()?.chainId;
  return useCallback(
    (asset) => {
      if (chainId !== undefined) localStore.set(lastAssetKey(chainId), asset.toString());
    },
    [chainId],
  );
}
