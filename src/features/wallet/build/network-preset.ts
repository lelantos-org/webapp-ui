import type { NetworkPreset } from "@lelantos-org/sdk";
import type { ChainEntry } from "@/config/chains";
import { env } from "@/config/env";

/// The `NetworkPreset` a wallet connects with, covering both the main wallet
/// and the ephemeral claim-link wallet.
///
/// `relayerUrl` and `fmdUrl` come from `env` rather than the entry: one
/// deployment of each serves every chain, selecting by chainId in the path or
/// query. Only per-chain values ride on `ChainEntry`.
///
/// Async because `ChainEntry.maspAddress` is resolved from the relayer when the
/// registry loads, and callers already await this.
export async function networkPreset(chain: ChainEntry): Promise<NetworkPreset> {
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
    // Without it the adapter it builds reports native-ETH deposits and
    // `withdrawEth` as unsupported, and every caller would have to construct a
    // `ViemChainAdapter` by hand.
    ...(chain.nativeAdapterAddress ? { nativeAdapterAddress: chain.nativeAdapterAddress } : {}),
  };
}
