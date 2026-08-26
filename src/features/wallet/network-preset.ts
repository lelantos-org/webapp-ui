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
    permit2Address: chain.permit2Address,
  };
}
