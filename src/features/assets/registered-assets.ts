// The asset list for the active chain.
//
// Read straight off the chain registry rather than fetched: the relayer's
// `/chains` now carries every registered asset with its symbol and decimals,
// so this no longer needs the explorer, the wallet, or a `symbol()` /
// `decimals()` round trip per token on every load.

import type { RegisteredAsset } from "@/config/chains";
import { useActiveChainOrUndefined } from "@/features/chain";

export type { RegisteredAsset };

/// Asset a form starts on, and the id the pickers fall back to while the
/// registry is empty or still loading.
///
/// A string because that is what a `<select>` value and the zod form schemas
/// are; `findAsset` parses it back to the `bigint` id.
export const DEFAULT_ASSET_ID = "1";

/// Assets registered on the active chain, lowest id first.
///
/// Synchronous: the registry that backs it resolves before anything below
/// `ChainProvider` renders, so there is no pending or error state for callers
/// to thread.
///
/// Empty means either the indexer has not caught up or there is no active
/// chain — the claim page renders before a wallet connects. Callers that know
/// which chain they mean should read `ChainEntry.tokens` directly instead.
/// Shared empty result. A literal `[]` would produce a new array identity on
/// every render while there is no active chain, invalidating any downstream
/// `useMemo` or `useEffect` that lists `assets` as a dependency.
const NO_ASSETS: RegisteredAsset[] = [];

export function useRegisteredAssets(): RegisteredAsset[] {
  return useActiveChainOrUndefined()?.tokens ?? NO_ASSETS;
}

/// Resolve a `RegisteredAsset` from a form-style asset id (decimal string or
/// bigint); `undefined` if the registry is empty or the id is unknown.
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
