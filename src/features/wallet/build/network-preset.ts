import type { NetworkPreset } from "@lelantos-org/sdk";
import type { ChainEntry } from "@/config/chains";
import { env } from "@/config/env";

/// The `NetworkPreset` a wallet (main or claim-link) connects with; service URLs come from `env`.
export function networkPreset(chain: ChainEntry): NetworkPreset {
  return {
    chainId: chain.chainId,
    treeDepth: chain.treeDepth,
    maspAddress: chain.maspAddress,
    relayerAddress: chain.relayerAddress,
    relayerUrl: env.relayerUrl,
    fmdUrl: env.fmdUrl,
    ...(chain.permit2Address ? { permit2Address: chain.permit2Address } : {}),
    ...(chain.nativeAdapterAddress ? { nativeAdapterAddress: chain.nativeAdapterAddress } : {}),
    ...(env.metaquoterUrl ? { quoterUrl: env.metaquoterUrl } : {}),
    ...(chain.swapWrapperAddress ? { swapWrapperAddress: chain.swapWrapperAddress } : {}),
  };
}
