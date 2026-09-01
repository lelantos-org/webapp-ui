import type { RegisteredAsset } from "./registered-assets";

/// Supplies the balance shown beside an asset in a picker, already formatted;
/// `undefined` for an asset whose balance is not known yet, which renders as a
/// bare symbol rather than a claimed zero.
///
/// Injected rather than read by the pickers, because the correct source depends
/// on the form. A spend draws on the shielded balance, which `useBalances`
/// already holds in full (see `useAssetBalanceLabel`). A deposit draws on the
/// transparent balance, fetched per asset, so labelling that picker would cost an
/// RPC read per registered token; deposit passes nothing and its options stay
/// bare.
export type AssetBalanceLabel = (asset: RegisteredAsset) => string | undefined;

/// How an asset's yield state reads in a picker, or `undefined` for one held as
/// plain custody, which carries no marker at all.
///
/// The same two words `ShieldedTable` puts on a row, so an asset described as
/// "earning" there is not described some other way here. A halted asset is
/// still a yield asset — fully backed, just no longer supplied to the venue —
/// so it says so rather than passing as plain.
export function assetYieldTag(asset: RegisteredAsset): string | undefined {
  if (!asset.yieldEnabled) return undefined;
  return asset.yieldHalted ? "yield paused" : "earning yield";
}

/// `USDC · 1,204.5 · earning yield`, dropping either half that is absent.
///
/// Takes the display name rather than the asset, so the native-ETH entry — which
/// spends WETH notes under the label "ETH (native)" — can show WETH's balance
/// and yield state without being labelled WETH.
///
/// Plain text, because a native `<option>` renders no markup: the marker cannot
/// be the styled chip the table uses, only another `·`-separated field.
export function assetOptionLabel(
  name: string,
  balance: string | undefined,
  yieldTag?: string,
): string {
  return [name, balance, yieldTag].filter((p) => p !== undefined).join(" · ");
}
