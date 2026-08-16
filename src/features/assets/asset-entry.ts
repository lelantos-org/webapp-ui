// Single boundary between the webapp's plain-bigint asset ids and the SDK's
// branded `AssetId`.

import { type AssetEntry, assetId, type EvmAddress, type WalletApi } from "@lelantos-org/sdk";

/// Read the on-chain registry entry for `asset`.
///
/// `ChainAdapter.fetchAsset` takes a branded `AssetId`, while the UI carries
/// plain bigints from form state and the explorer registry. Branding happens
/// here, so `assetId` validation has a single call site.
export function fetchAssetEntry(wallet: WalletApi, asset: bigint): Promise<AssetEntry> {
  return wallet.chain.fetchAsset(assetId(asset));
}

export interface AssetFeeInputs {
  /// Circuit-units → base-units multiplier.
  scale: bigint;
  /// Protocol fee in basis points, from `MASP.feeBps()`.
  feeBps: bigint;
  /// ERC-20 backing this asset id.
  token: EvmAddress;
}

/// Read everything a fee estimate for `asset` needs, in one round trip.
export async function fetchAssetFeeInputs(
  wallet: WalletApi,
  asset: bigint,
): Promise<AssetFeeInputs> {
  const [entry, feeBps] = await Promise.all([
    fetchAssetEntry(wallet, asset),
    wallet.chain.fetchFeeBps(),
  ]);
  return { scale: entry.scale, feeBps, token: entry.token };
}
