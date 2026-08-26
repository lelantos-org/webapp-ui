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

/// `USDC · 1,204.5`, or just the name when there is no balance to add.
///
/// Takes the display name rather than the asset, so the native-ETH entry — which
/// spends WETH notes under the label "ETH (native)" — can show WETH's balance
/// without being labelled WETH.
export function assetOptionLabel(name: string, balance: string | undefined): string {
  return balance === undefined ? name : `${name} · ${balance}`;
}
