import type { NetworkPreset } from "@lelantos-org/sdk";
import type { ChainEntry } from "@/config/chains";
import { env } from "@/config/env";

/// The `NetworkPreset` a wallet connects with, covering both the main wallet
/// and the ephemeral claim-link wallet.
///
/// `relayerUrl`, `fmdUrl` and `quoterUrl` come from `env` rather than the entry:
/// one deployment of each serves every chain, selecting by chainId in the path
/// or query. Only per-chain values ride on `ChainEntry`.
export function networkPreset(chain: ChainEntry): NetworkPreset {
  return {
    chainId: chain.chainId,
    treeDepth: chain.treeDepth,
    maspAddress: chain.maspAddress,
    relayerAddress: chain.relayerAddress,
    relayerUrl: env.relayerUrl,
    fmdUrl: env.fmdUrl,
    // Omitted rather than `undefined` where the chain has none: the preset's
    // optional keys mean "absent".
    ...(chain.permit2Address ? { permit2Address: chain.permit2Address } : {}),
    // Carried on the preset so `connect()` can build the chain layer itself.
    // Without it the adapter it builds reports native deposits and withdrawals
    // as unsupported (`capabilities.nativeDeposit` / `nativeWithdraw`).
    ...(chain.nativeAdapterAddress ? { nativeAdapterAddress: chain.nativeAdapterAddress } : {}),
    // What `quoteSwap` prices against and `swap` binds. Without a quoter the
    // wallet reports `capabilities.swap` false; without a wrapper here the SDK
    // falls back to the relayer's advertised one.
    ...(env.metaquoterUrl ? { quoterUrl: env.metaquoterUrl } : {}),
    ...(chain.swapWrapperAddress ? { swapWrapperAddress: chain.swapWrapperAddress } : {}),
  };
}
