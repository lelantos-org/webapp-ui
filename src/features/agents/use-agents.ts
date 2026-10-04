import { useSyncExternalStore } from "react";
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

/// Nothing is pruned on mount: a record may be the only copy of a key that still holds funds.
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
