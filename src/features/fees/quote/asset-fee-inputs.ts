// What a protocol-fee estimate reads from the asset registry, fetched once per
// `(asset, leg)`. Not a hook: `useFeePreview` and `useAssetFeeBps` query it.

import { assetId, type EvmAddress, type WalletApi } from "@lelantos-org/sdk";
import type { FeeLeg } from "@/shared/domain/op-kind";

/// What a protocol-fee estimate reads from the asset registry.
export interface AssetFeeInputs {
  /// Circuit-units → base-units multiplier.
  scale: bigint;
  /// Protocol fee in basis points for the leg that was asked for.
  feeBps: bigint;
  /// ERC-20 backing this asset id.
  token: EvmAddress;
  /// Yield index, RAY-scaled; `RAY` for an asset held as plain custody.
  ///
  /// Carried with the rate because a fee is charged on a converted amount, and
  /// a yield asset's unit is worth `scale * index / RAY` rather than `scale`.
  /// Omitting it here understates what a deposit costs — and this figure sizes
  /// the Permit2 window, so an understatement is a deposit the pool cannot pull.
  index: bigint;
}

/// Read everything a fee estimate for `(asset, leg)` needs, in one round trip.
///
/// One call: the per-asset, per-leg rates come back with the entry from
/// `asset(id)`.
///
/// Goes through `wallet.asset` rather than a raw `chain.fetchAsset`. Both read
/// the same registry row, but the wallet's resolution is chain-verified and
/// cached briefly, so the raw chain read would issue a request per
/// `(asset, leg)` — and per settled amount, since `useFeePreview` keys on it —
/// and could state a rate the spend path does not use. `useAssetLadder` (`unshield/denominations/use-ladder.ts`)
/// reads the ladder through the wallet for the same reason.
///
/// `leg` is resolved here rather than handed back as a pair, so no caller ever
/// holds both rates and none can pair one leg's rate with the other's
/// direction — a mismatch that would misstate the fee silently, in whichever
/// direction the user notices.
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
