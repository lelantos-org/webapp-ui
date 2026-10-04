// Agent wallets hold long-lived spending keys: persist before broadcast, or a remount loses funds.
// Records never expire; `policy.ts` caps the count.

import { createLogger } from "@/shared/lib/logger";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { createRecordStore } from "@/shared/lib/storage/record-store";
import { newestFirst, normalize } from "./policy";
import { isRecordArray, type StoredAgent } from "./record";

/// Never log a record's `nsk`: that string is the spending key.
const log = createLogger("agents");

const store = createRecordStore<StoredAgent>({
  key: LOCAL_KEYS.agents,
  noun: "agents",
  log,
  isRecordArray,
  order: newestFirst,
});

export const subscribeAgents = store.subscribe;

/// Every stored agent, newest first, with a stable identity between changes.
export const agentsSnapshot = store.snapshot;

/// The last write did not reach `localStorage`, so every key lives only as long as this tab.
export const agentsMemoryOnly = store.memoryOnly;

export const resetForTest = store.resetForTest;

function persist(records: readonly StoredAgent[]): void {
  store.persist(normalize(records));
}

export interface RememberAgentInput {
  label: string;
  chainId: bigint;
  address: string;
  nsk: string;
}

/// Persist an agent and return its id. Call before broadcasting the funding transfer.
export function rememberAgent(input: RememberAgentInput, now = Date.now()): string {
  const record: StoredAgent = {
    id: crypto.randomUUID(),
    label: input.label,
    chainId: input.chainId.toString(),
    address: input.address,
    nsk: input.nsk,
    createdAt: now,
  };

  persist([record, ...agentsSnapshot()]);
  log.debug("remembered agent", record.id, `chain=${record.chainId}`);
  return record.id;
}

/// Note that a credential left this browser; a no-op for a record that is gone.
export function markAgentCopied(id: string, now = Date.now()): void {
  update(id, (r) => ({ ...r, copiedAt: now }), "copied");
}

/// Mark an agent swept. The record stays, so a revoked agent remains auditable.
export function markAgentRevoked(id: string, now = Date.now()): void {
  update(id, (r) => ({ ...r, revokedAt: now }), "revoked");
}

/// Drop one record. The agent keeps its own copy of the key, so this forgets, it does not revoke.
export function forgetAgent(id: string): void {
  persist(agentsSnapshot().filter((r) => r.id !== id));
  log.debug("forgot agent", id);
}

function update(id: string, change: (r: StoredAgent) => StoredAgent, what: string): void {
  const records = agentsSnapshot();
  if (!records.some((r) => r.id === id)) {
    log.warn(`no stored agent to mark ${what}`, id);
    return;
  }
  persist(records.map((r) => (r.id === id ? change(r) : r)));
  log.debug(`agent ${what}`, id);
}
