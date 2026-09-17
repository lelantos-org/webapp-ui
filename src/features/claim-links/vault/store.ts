// Claim links hold bearer spending keys: persist before broadcast, or a remount loses funds.

import { createSubscribers } from "@/shared/lib/external-store";
import { createLogger } from "@/shared/lib/logger";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore, readJson, writeJson } from "@/shared/lib/storage/safe";
import { newestFirst, normalize } from "./policy";
import { isRecordArray, type StoredClaimLink } from "./record";

/// Never log a record's `url`: that string is the bearer secret.
const log = createLogger("claim-links");

const KEY = LOCAL_KEYS.claimLinks;

/// Parse the stored payload, newest first. A pure read, safe in render; one bad entry discards all.
function parse(): StoredClaimLink[] {
  const stored = readJson(localStore, KEY, isRecordArray);
  if (!stored) {
    if (localStore.get(KEY) !== undefined) {
      log.warn("stored claim links failed validation; treating the store as empty");
    }
    return [];
  }
  return [...stored].sort(newestFirst);
}

interface Cache {
  /// The raw string `records` was parsed from, keeping snapshot identity for any writer.
  raw: string | undefined;
  /// Stable identity between changes; handed straight to React.
  records: StoredClaimLink[];
  /// A write failed: `records` is then the only copy, so storage is not re-read until one lands.
  mirrorOnly: boolean;
}

const cache: Cache = { raw: undefined, records: [], mirrorOnly: false };

const subscribers = createSubscribers();

export function subscribeClaimLinks(listener: () => void): () => void {
  return subscribers.subscribe(listener);
}

// Another tab may add a link whose key exists nowhere else.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) subscribers.notify();
  });
}

/// Normalize, store and publish: the only mutation of `cache` or `localStorage`.
function persist(records: readonly StoredClaimLink[], now: number): void {
  const kept = normalize(records, now);

  // Set before writing, so the snapshot stays correct if storage refuses the write.
  cache.records = kept;

  if (writeJson(localStore, KEY, kept)) {
    cache.raw = localStore.get(KEY);
    if (cache.mirrorOnly) log.info("localStorage writable again; claim links persist once more");
    cache.mirrorOnly = false;
  } else if (!cache.mirrorOnly) {
    log.warn(
      `localStorage refused the write — ${kept.length} claim link(s) are held in memory only ` +
        "and will not survive this tab",
    );
    cache.mirrorOnly = true;
  }

  subscribers.notify();
}

/// Every stored record, newest first, with a stable identity between changes.
export function claimLinksSnapshot(): StoredClaimLink[] {
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

/// The last write did not reach `localStorage`, so every record lives only as long as this tab.
export function claimLinksMemoryOnly(): boolean {
  return cache.mirrorOnly;
}

export interface RememberClaimLinkInput {
  url: string;
  chainId: bigint;
  assetId: bigint;
  amount: bigint;
}

/// Persist a link and return its id. Call **before** broadcasting.
/// At capacity this drops the oldest record: callers check `nextEvicted` first.
export function rememberClaimLink(input: RememberClaimLinkInput, now = Date.now()): string {
  const record: StoredClaimLink = {
    id: crypto.randomUUID(),
    url: input.url,
    chainId: input.chainId.toString(),
    assetId: input.assetId.toString(),
    amount: input.amount.toString(),
    createdAt: now,
  };

  persist([record, ...claimLinksSnapshot()], now);
  log.debug("remembered claim link", record.id, `chain=${record.chainId}`);
  return record.id;
}

/// Attach the tx hash once the transfer is out.
export function markClaimLinkBroadcast(id: string, txHash: string, now = Date.now()): void {
  const records = claimLinksSnapshot();
  if (!records.some((r) => r.id === id)) {
    log.warn("no stored claim link to mark broadcast", id);
    return;
  }

  persist(
    records.map((r) => (r.id === id ? { ...r, txHash } : r)),
    now,
  );
  log.debug("claim link broadcast", id, txHash);
}

/// Note that a link left this browser via a copy or share; a no-op for a record that is gone.
export function markClaimLinkCopied(id: string, now = Date.now()): void {
  const records = claimLinksSnapshot();
  if (!records.some((r) => r.id === id)) return;
  persist(
    records.map((r) => (r.id === id ? { ...r, copiedAt: now } : r)),
    now,
  );
  log.debug("claim link copied", id);
}

/// Drop one record, once the user confirms the link has been handed over.
export function forgetClaimLink(id: string, now = Date.now()): void {
  forgetClaimLinks([id], now);
}

/// Drop several records in one write, so another tab never sees a half-applied batch.
export function forgetClaimLinks(ids: readonly string[], now = Date.now()): void {
  if (ids.length === 0) return;
  const drop = new Set(ids);
  persist(
    claimLinksSnapshot().filter((r) => !drop.has(r.id)),
    now,
  );
  log.debug(`forgot ${drop.size} claim link(s)`);
}

/// Drop records past the TTL and report whether any went. Call from an effect, never during render.
export function pruneExpiredClaimLinks(now = Date.now()): boolean {
  const records = claimLinksSnapshot();
  const kept = normalize(records, now);

  // Skip the write when nothing changed, or the calling effect re-runs forever.
  if (kept.length === records.length) return false;

  persist(kept, now);
  log.debug(`pruned ${records.length - kept.length} expired claim link(s)`);
  return true;
}
