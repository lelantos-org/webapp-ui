import type { RegisteredAsset } from "@/config/chains";
import { useActiveChain } from "@/features/chain";
import { ethOption } from "./eth-option";
import { formatWindowShort, rateLabel } from "./rate-label";
import { useRegisteredAssets } from "./registered-assets";
import { useAssetBalanceLabel } from "./use-balances";

/// Supplies the balance shown beside an asset in a picker, already formatted;
/// `undefined` for an asset whose balance is not known yet, which renders as a
/// bare symbol rather than a claimed zero.
///
/// The spends' pickers label with the shielded balance, which `useBalances`
/// already holds in full (see `useAssetBalanceLabel`). Shield's picker is its own
/// screen: the transparent balance is fetched per asset, so labelling a
/// `<select>` with it would cost an RPC read per registered token.
export type AssetBalanceLabel = (asset: RegisteredAsset) => string | undefined;

/// How an asset's rate reads in a picker: "4.18% / yr · 7d", "does not earn",
/// "paused · still fully backed", or "rate cannot be measured".
///
/// The words `rateLabel` gives the Shield picker and the portfolio,
/// flattened to text, so an asset described one way there is not described
/// another way here. A rate carries its measured window; an unmeasurable one is
/// spelled out rather than drawn as the dash, which a native option cannot hide
/// from a screen reader or explain.
export function assetRateTag(asset: RegisteredAsset): string {
  const rate = rateLabel(asset);
  switch (rate.kind) {
    case "rate":
      // `rateLabel` only yields a rate for an asset with `apy`.
      return asset.apy ? `${rate.rate} · ${formatWindowShort(asset.apy.windowDays)}` : rate.rate;
    case "paused":
      return "paused · still fully backed";
    case "unmeasured":
      return "rate cannot be measured";
    case "plain":
      return "does not earn";
  }
}

/// `USDC · 1,204.5 · 4.18% / yr · 7d`, dropping a part that is absent.
///
/// Takes the display name rather than the asset, so the native-ETH entry — which
/// spends WETH notes under the label "ETH (native)" — can show WETH's balance
/// and rate without being labelled WETH.
///
/// Plain text, because a native `<option>` renders no markup: the marker cannot
/// be styled the way the portfolio list is, only another `·`-separated field.
export function assetOptionLabel(
  name: string,
  balance: string | undefined,
  rateTag?: string,
): string {
  return [name, balance, rateTag].filter((p) => p !== undefined).join(" · ");
}

/// One entry in an asset picker: what the pill draws when it is chosen, and the
/// text of its native `<option>`.
export interface AssetSelectOption {
  /// An asset id as a decimal string, or an `ethOption` sentinel.
  value: string;
  /// Drawn on the pill when this option is selected.
  symbol: string;
  /// Token address, for vendor artwork. Absent on a native-coin entry, whose
  /// mark is the coin's rather than the wrapper's.
  address?: string | undefined;
  /// The option's text in the native list: "USDC · 8,420 · 4.18% / yr · 7d".
  label: string;
}

export interface AssetSelectOptionsInputs {
  /// Prepend an "ETH (native)" entry for each WETH-tagged id. Withheld on a
  /// chain with no `NativeAdapter`, which has no entry point for native coin.
  showEth?: boolean;
  /// The chain has a `NativeAdapter` deployed.
  nativeEthSupported?: boolean;
  /// Balance to show beside each symbol. See `AssetBalanceLabel`.
  balanceOf?: AssetBalanceLabel | undefined;
  /// Tag each entry with its rate. Send and Unshield do; Swap's legs and Send by
  /// link list the bare symbol and balance.
  rateTag?: boolean;
}

/// The entries a picker offers, in registry order.
///
/// Every WETH id gets its own native entry, not the first: a plain and a
/// yield-bound registration of the same token are both reachable as native
/// coin, and they are different assets (see `eth-option.ts`). A native entry
/// spends the notes of the WETH id it names, so it carries that id's balance and
/// rate — where there are several, the rate tag is what tells them apart.
export function assetSelectOptions(
  list: readonly RegisteredAsset[],
  {
    showEth = false,
    nativeEthSupported = false,
    balanceOf,
    rateTag = true,
  }: AssetSelectOptionsInputs,
): AssetSelectOption[] {
  // The vault joins the name so a plain asset and its earning twin, which share
  // a symbol, read differently even with the rate tag off.
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

/// The active chain's registered assets as picker entries for a spend, labelled
/// with the shielded balance; see `assetSelectOptions`.
///
/// Native-ETH support is read per render, since the active chain can change.
export function useAssetSelectOptions(
  inputs: Pick<AssetSelectOptionsInputs, "showEth" | "rateTag"> = {},
): AssetSelectOption[] {
  const list = useRegisteredAssets();
  const balanceOf = useAssetBalanceLabel();
  const nativeEthSupported = useActiveChain().nativeAdapterAddress !== undefined;
  return assetSelectOptions(list, { ...inputs, balanceOf, nativeEthSupported });
}
