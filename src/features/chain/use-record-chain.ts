import { useCallback } from "react";
import { type ChainEntry, findChain, type RegisteredAsset } from "@/config/chains";
import { useChainRegistry } from "./context";

/// A stored record, naming its chain as a decimal string.
interface ChainStamped {
  chainId: string;
}

/// The registry entry for a stored record's chain, or `undefined` if the registry does not serve it.
export function useRecordChain(): (record: ChainStamped) => ChainEntry | undefined {
  const registry = useChainRegistry();
  return useCallback(
    (record: ChainStamped) => findChain(registry, BigInt(record.chainId)),
    [registry],
  );
}

/// The tokens a stored record is labelled from: its own chain's, as asset ids are per chain.
export function useRecordAssets(): (record: ChainStamped) => readonly RegisteredAsset[] {
  const chainFor = useRecordChain();
  return useCallback((record: ChainStamped) => chainFor(record)?.tokens ?? [], [chainFor]);
}
