import type { RegisteredAsset } from "@/config/chains";
import type { AssetSelectOption } from "@/features/assets";

interface AssetReadsConfig {
  assets: RegisteredAsset[];
  /// The shielded balance every asset reports. Default: 0.
  balance?: bigint;
  /// Default: one per asset, labelled by symbol.
  options?: AssetSelectOption[];
}

/// The `assets` feature's reads for a synced wallet with no prices; `config` is read per call.
export function assetReads(config: () => AssetReadsConfig) {
  return {
    usePrices: () => new Map(),
    useRegisteredAssets: () => config().assets,
    useAssetBalance: (asset: bigint | undefined) => ({
      asset,
      balance: config().balance ?? 0n,
      notes: 1,
      pending: 0n,
      outflow: 0n,
    }),
    useBalances: () => ({ isLoading: false }),
    useAssetSelectOptions: (): AssetSelectOption[] => {
      const { assets, options } = config();
      return (
        options ?? assets.map((a) => ({ value: String(a.id), symbol: a.symbol, label: a.symbol }))
      );
    },
  };
}
