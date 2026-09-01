// Single boundary between the webapp's plain-bigint asset ids and the SDK's
// branded `AssetId`.

import { type AssetEntry, assetId, type EvmAddress, type WalletApi } from "@lelantos-org/sdk";
import type { FeeMode } from "@/shared/lib/fees";

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

/// Read everything a fee estimate for `(asset, mode)` needs, in one round trip.
///
/// One call rather than two since contracts 0.5.0: fees moved from a pool-wide
/// `MASP.feeBps()` to per-asset, per-leg rates that `asset(id)` already returns
/// with the entry.
///
/// Goes through `wallet.asset` rather than `fetchAssetEntry`. Both read the same
/// registry row, but the wallet's resolution is cached for its lifetime and
/// applies `WalletConfig.feeBps`, so the raw chain read would issue a request
/// per `(asset, leg)` — and per settled amount, since `useFeePreview` keys on
/// it — and would state a rate the spend path does not use wherever a
/// deployment overrides one. The same argument `use-asset-ladder.ts` makes for
/// reading the ladder through the wallet.
///
/// `mode` is resolved here rather than handed back as a pair, so no caller ever
/// holds both rates and none can pair one leg's rate with the other's
/// direction — a mismatch that would misstate the fee silently, in whichever
/// direction the user notices.
export async function fetchAssetFeeInputs(
  wallet: WalletApi,
  asset: bigint,
  mode: FeeMode,
): Promise<AssetFeeInputs> {
  const info = await wallet.asset(assetId(asset));
  return {
    scale: info.scale,
    feeBps: mode === "deposit" ? info.depositBps : info.withdrawBps,
    token: info.token,
    index: info.index,
  };
}
