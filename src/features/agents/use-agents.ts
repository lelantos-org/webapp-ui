import { useCallback, useSyncExternalStore } from "react";
import type { ChainEntry, RegisteredAsset } from "@/config/chains";
import { findChain } from "@/config/chains";
import { useChainRegistry } from "@/features/chain";
import { atCapacity, nextEvicted } from "./policy";
import type { StoredAgent } from "./record";
import { agentsMemoryOnly, agentsSnapshot, subscribeAgents } from "./store";

export interface AgentsView {
  /// See `agentsSnapshot`.
  stored: StoredAgent[];
  /// Live agents, newest first.
  active: StoredAgent[];
  /// One more agent would push the oldest, and its key, out of storage.
  full: boolean;
  /// The record a new agent would evict, if any.
  evicted: StoredAgent | undefined;
  /// Storage refused the last write; see `agentsMemoryOnly`.
  memoryOnly: boolean;
}

/// No pruning on mount, unlike the claim-link vault: an agent record is the only
/// copy of a key that may still hold funds, so nothing here expires on a clock.
export function useAgents(): AgentsView {
  const stored = useSyncExternalStore(subscribeAgents, agentsSnapshot, agentsSnapshot);
  return {
    stored,
    active: stored.filter((a) => a.revokedAt === undefined),
    full: atCapacity(stored),
    evicted: nextEvicted(stored),
    memoryOnly: agentsMemoryOnly(),
  };
}

/// The registry entry an agent belongs to, or `undefined` if the registry no longer serves it.
export function useAgentChainFor(): (agent: StoredAgent) => ChainEntry | undefined {
  const registry = useChainRegistry();
  return useCallback(
    (agent: StoredAgent) => findChain(registry, BigInt(agent.chainId)),
    [registry],
  );
}

/// The tokens an agent is labelled from: its own chain's, as asset ids are per chain.
export function useAgentAssetsFor(): (agent: StoredAgent) => readonly RegisteredAsset[] {
  const chainFor = useAgentChainFor();
  return useCallback((agent: StoredAgent) => chainFor(agent)?.tokens ?? [], [chainFor]);
}
