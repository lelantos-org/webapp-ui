import { useMemo } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useActiveChain } from "@/features/chain";
import { formatAssetCompact } from "@/shared/lib/format/asset";
import { useBalances } from "../balances/use-balances";
import { useRegisteredAssets } from "../registry/registered-assets";
import { assetRateTag } from "../yield/rate-label";
import { ethOption } from "./eth-option";

/// Formatted balance beside an asset in a picker; `undefined` when unknown, never a claimed zero.
export type AssetBalanceLabel = (asset: RegisteredAsset) => string | undefined;

/// Confirmed shielded balance per asset, formatted for pickers. `undefined` until a sync succeeds.
export function useAssetBalanceLabel(): AssetBalanceLabel {
  const { data } = useBalances();
  return useMemo((): AssetBalanceLabel => {
    if (!data) return () => undefined;
    const byAsset = new Map(data.balances.map((b) => [b.asset, b.balance]));
    return (asset) => formatAssetCompact(byAsset.get(asset.id) ?? 0n, asset);
  }, [data]);
}

/// `USDC · 1,204.5 · 4.18% / yr · 7d`, dropping absent parts; plain text for `<option>`.
export function assetOptionLabel(
  name: string,
  balance: string | undefined,
  rateTag?: string,
): string {
  return [name, balance, rateTag].filter((p) => p !== undefined).join(" · ");
}

/// One asset picker entry: what the pill draws and its native `<option>` text.
export interface AssetSelectOption {
  /// An asset id as a decimal string, or an `ethOption` sentinel.
  value: string;
  /// Drawn on the pill when this option is selected.
  symbol: string;
  /// Token address for artwork; absent on a native-coin entry.
  address?: string | undefined;
  /// The option's text in the native list: "USDC · 8,420 · 4.18% / yr · 7d".
  label: string;
}

export interface AssetSelectOptionsInputs {
  /// Prepend an "ETH (native)" entry for each WETH id.
  showEth?: boolean;
  /// The chain has a `NativeAdapter` deployed.
  nativeEthSupported?: boolean;
  /// Balance to show beside each symbol. See `AssetBalanceLabel`.
  balanceOf?: AssetBalanceLabel | undefined;
  /// Tag each entry with its rate.
  rateTag?: boolean;
}

/// The entries a picker offers, in registry order, with one native entry per WETH id.
export function assetSelectOptions(
  list: readonly RegisteredAsset[],
  {
    showEth = false,
    nativeEthSupported = false,
    balanceOf,
    rateTag = true,
  }: AssetSelectOptionsInputs,
): AssetSelectOption[] {
  const label = (name: string, a: RegisteredAsset) =>
    assetOptionLabel(
      a.vaultName ? `${name} · ${a.vaultName}` : name,
      balanceOf?.(a),
      rateTag ? assetRateTag(a) : undefined,
    );
  const weths = showEth && nativeEthSupported ? list.filter((a) => a.isWeth) : [];
  return [
    ...weths.map((a) => ({
      value: ethOption(a.id),
      symbol: "ETH",
      address: undefined,
      label: label("ETH (native)", a),
    })),
    ...list.map((a) => ({
      value: a.id.toString(),
      symbol: a.symbol,
      address: a.token,
      label: label(a.symbol, a),
    })),
  ];
}

/// The active chain's assets as spend picker entries, labelled with the shielded balance.
export function useAssetSelectOptions(
  inputs: Pick<AssetSelectOptionsInputs, "showEth" | "rateTag"> = {},
): AssetSelectOption[] {
  const list = useRegisteredAssets();
  const balanceOf = useAssetBalanceLabel();
  const nativeEthSupported = useActiveChain().nativeAdapterAddress !== undefined;
  return assetSelectOptions(list, { ...inputs, balanceOf, nativeEthSupported });
}
