import { env } from "@/config/env";

interface ChainHealth {
  chainId: number;
  committedCount: number;
  currentRootHex: string;
  maspAddress: string;
}

interface ChainsResponse {
  chains: ChainHealth[];
}

let cached: Promise<ChainsResponse> | undefined;

function fetchChains(): Promise<ChainsResponse> {
  if (!cached) {
    cached = fetch(`${env.relayerUrl}/chains`).then(async (r) => {
      if (!r.ok) {
        cached = undefined;
        throw new Error(`relayer /chains ${r.status}`);
      }
      return (await r.json()) as ChainsResponse;
    });
  }
  return cached;
}

/// Resolve MASP address for `chainId` from the relayer's `/chains` endpoint.
/// Falls back to `VITE_MASP_ADDRESS` if the relayer is unreachable or doesn't
/// know the chain. Cached for the page lifetime.
export async function resolveMaspAddress(chainId: bigint): Promise<string> {
  try {
    const r = await fetchChains();
    const hit = r.chains.find((c) => BigInt(c.chainId) === chainId);
    if (hit?.maspAddress) return hit.maspAddress;
  } catch {
    // fall through
  }
  if (env.maspAddress) return env.maspAddress;
  throw new Error(`MASP address unknown for chainId=${chainId}`);
}
