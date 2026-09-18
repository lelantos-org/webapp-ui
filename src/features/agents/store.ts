// Agent wallets hold long-lived spending keys: persist before broadcast, or a remount loses funds.
//
// Modelled on the claim-link vault, with one deliberate difference: records never
// expire. A claim link's key should stop existing; an agent's key is the only
// copy of something still holding funds, so time passing is not a reason to
// forget it. `policy.ts` caps the count instead.

import { createSubscribers } from "@/shared/lib/external-store";
import { createLogger } from "@/shared/lib/logger";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore, readJson, writeJson } from "@/shared/lib/storage/safe";
import { newestFirst, normalize } from "./policy";
import { isRecordArray, type StoredAgent } from "./record";

/// Never log a record's `nsk`: that string is the spending key.
const log = createLogger("agents");

const KEY = LOCAL_KEYS.agents;

/// Parse the stored payload, newest first. A pure read, safe in render; one bad entry discards all.
function parse(): StoredAgent[] {
  const stored = readJson(localStore, KEY, isRecordArray);
  if (!stored) {
    if (localStore.get(KEY) !== undefined) {
      log.warn("stored agents failed validation; treating the store as empty");
    }
    return [];
  }
  return [...stored].sort(newestFirst);
}

interface Cache {
  /// The raw string `records` was parsed from, keeping snapshot identity for any writer.
  raw: string | undefined;
  /// Stable identity between changes; handed straight to React.
  records: StoredAgent[];
  /// A write failed: `records` is then the only copy, so storage is not re-read until one lands.
  mirrorOnly: boolean;
}

const cache: Cache = { raw: undefined, records: [], mirrorOnly: false };

const subscribers = createSubscribers();

export function subscribeAgents(listener: () => void): () => void {
  return subscribers.subscribe(listener);
}

// Another tab may fund an agent whose key exists nowhere else.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) subscribers.notify();
  });
}

/// Normalize, store and publish: the only mutation of `cache` or `localStorage`.
function persist(records: readonly StoredAgent[]): void {
  const kept = normalize(records);

  // Set before writing, so the snapshot stays correct if storage refuses the write.
  cache.records = kept;

  if (writeJson(localStore, KEY, kept)) {
    cache.raw = localStore.get(KEY);
    if (cache.mirrorOnly) log.info("localStorage writable again; agents persist once more");
    cache.mirrorOnly = false;
  } else if (!cache.mirrorOnly) {
    log.warn(
      `localStorage refused the write — ${kept.length} agent key(s) are held in memory only ` +
        "and will not survive this tab",
    );
    cache.mirrorOnly = true;
  }

  subscribers.notify();
}

/// Every stored agent, newest first, with a stable identity between changes.
export function agentsSnapshot(): StoredAgent[] {
  if (cache.mirrorOnly) return cache.records;

  const raw = localStore.get(KEY);
  if (raw !== cache.raw) {
    cache.raw = raw;
    cache.records = parse();
  }
  return cache.records;
}

/// Test seam: reset the parsed snapshot and write-refused latch. Pair with `localStorage.clear()`.
export function resetForTest(): void {
  cache.raw = undefined;
  cache.records = [];
  cache.mirrorOnly = false;
}

/// The last write did not reach `localStorage`, so every key lives only as long as this tab.
export function agentsMemoryOnly(): boolean {
  return cache.mirrorOnly;
}

export interface RememberAgentInput {
  label: string;
  chainId: bigint;
  address: string;
  nsk: string;
}

/// Persist an agent and return its id. Call **before** broadcasting the funding transfer.
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
