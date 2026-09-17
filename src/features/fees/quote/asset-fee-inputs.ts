import { assetId, type EvmAddress, type WalletApi } from "@lelantos-org/sdk";
import type { FeeLeg } from "@/shared/domain/op-kind";

/// What a protocol-fee estimate reads from the asset registry.
export interface AssetFeeInputs {
  scale: bigint;
  feeBps: bigint;
  token: EvmAddress;
  /// Yield index, RAY-scaled. Omitting it understates the Permit2 window and the deposit fails.
  index: bigint;
}

/// Fetch the scale, `leg` rate, token and index for `asset` via the wallet's verified, cached registry.
export async function fetchAssetFeeInputs(
  wallet: WalletApi,
  asset: bigint,
  leg: FeeLeg,
): Promise<AssetFeeInputs> {
  const info = await wallet.asset(assetId(asset));
  return {
    scale: info.scale,
    feeBps: leg === "deposit" ? info.depositBps : info.withdrawBps,
    token: info.token,
    index: info.index,
  };
}
