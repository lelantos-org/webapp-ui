// The asset list for the active chain.
//
// Read from the chain registry rather than fetched: the relayer's `/chains`
// carries every registered asset with its symbol and decimals, so no explorer,
// wallet, or per-token `symbol()` / `decimals()` round trip is needed.

import { type AssetEntry, assetId, type WalletApi } from "@lelantos-org/sdk";
import { DEFAULT_ASSET as SDK_DEFAULT_ASSET } from "@lelantos-org/sdk/wallet";
import type { RegisteredAsset } from "@/config/chains";
import { useActiveChainOrUndefined } from "@/features/chain";

/// The asset an op falls back to when none is named.
///
/// The SDK's own default rather than a second `1n`: an op submitted without an
/// asset moves this one, so anything recorded or tagged about that op — the
/// pending overlay, a claim link's vault record — has to name the same id or it
/// describes a different asset from the one that moved.
export const DEFAULT_ASSET: bigint = SDK_DEFAULT_ASSET;

/// `DEFAULT_ASSET` in form spelling: the value a form starts on, and the id the
/// pickers fall back to while the registry is empty or still loading.
///
/// A string, matching a `<select>` value and the zod form schemas; `findAsset`
/// parses it back to the `bigint` id.
export const DEFAULT_ASSET_ID = DEFAULT_ASSET.toString();

/// Assets registered on the active chain, lowest id first.
///
/// Synchronous: the backing registry resolves before anything below
/// `ChainProvider` renders, so callers have no pending or error state to thread.
///
/// Empty means either the indexer has not caught up or there is no active chain,
/// as on the claim page before a wallet connects. Callers that know which chain
/// they mean should read `ChainEntry.tokens` directly.

/// Shared empty result. A literal `[]` would produce a new array identity on
/// every render while there is no active chain, invalidating any downstream
/// `useMemo` or `useEffect` listing `assets` as a dependency.
const NO_ASSETS: readonly RegisteredAsset[] = [];

export function useRegisteredAssets(): readonly RegisteredAsset[] {
  return useActiveChainOrUndefined()?.tokens ?? NO_ASSETS;
}

/// Resolve a `RegisteredAsset` from a form-style asset id, given as a decimal
/// string or a bigint. Returns `undefined` when the registry is empty or the id
/// is unknown.
export function findAsset(
  assets: readonly RegisteredAsset[] | undefined,
  id: string | bigint | undefined,
): RegisteredAsset | undefined {
  if (!assets || id === undefined || id === "") return undefined;
  const target = typeof id === "bigint" ? id : safeParseAssetId(id);
  if (target === undefined) return undefined;
  return assets.find((a) => a.id === target);
}

function safeParseAssetId(s: string): bigint | undefined {
  try {
    const v = BigInt(s.trim());
    return v >= 0n ? v : undefined;
  } catch {
    return undefined;
  }
}

/// Read the on-chain registry entry for `asset`: the single boundary between the
/// webapp's plain-bigint asset ids and the SDK's branded `AssetId`.
///
/// `ChainAdapter.fetchAsset` takes a branded `AssetId`, while the UI carries
/// plain bigints from form state and the explorer registry. Branding happens
/// here, so `assetId` validation has a single call site.
export function fetchAssetEntry(wallet: WalletApi, asset: bigint): Promise<AssetEntry> {
  return wallet.chain.fetchAsset(assetId(asset));
}
