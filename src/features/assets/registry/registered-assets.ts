import type { RegisteredAsset } from "@/config/chains";
import { useActiveChainOrUndefined } from "@/features/chain";

const DEFAULT_ASSET = 1n;

/// The default asset id as a form string; also the pickers' fallback while the registry is empty.
export const DEFAULT_ASSET_ID = DEFAULT_ASSET.toString();

/// Stable empty result, so dependents' memo and effect deps do not churn.
const NO_ASSETS: readonly RegisteredAsset[] = [];

/// Assets registered on the active chain, lowest id first. Empty when there is no active chain.
export function useRegisteredAssets(): readonly RegisteredAsset[] {
  return useActiveChainOrUndefined()?.tokens ?? NO_ASSETS;
}

/// Resolve a `RegisteredAsset` from a decimal-string or bigint id.
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
