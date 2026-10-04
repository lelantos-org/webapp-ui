// Claim links hold bearer spending keys: persist before broadcast, or a remount loses funds.

import { createLogger } from "@/shared/lib/logger";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { createRecordStore } from "@/shared/lib/storage/record-store";
import { newestFirst, normalize } from "./policy";
import { isRecordArray, type StoredClaimLink } from "./record";

/// Never log a record's `url`: that string is the bearer secret.
const log = createLogger("claim-links");

const store = createRecordStore<StoredClaimLink>({
  key: LOCAL_KEYS.claimLinks,
  noun: "claim links",
  log,
  isRecordArray,
  order: newestFirst,
});

export const subscribeClaimLinks = store.subscribe;

/// Every stored record, newest first, with a stable identity between changes.
export const claimLinksSnapshot = store.snapshot;

/// The last write did not reach `localStorage`, so every record lives only as long as this tab.
export const claimLinksMemoryOnly = store.memoryOnly;

export const resetForTest = store.resetForTest;

function persist(records: readonly StoredClaimLink[], now: number): void {
  store.persist(normalize(records, now));
}

export interface RememberClaimLinkInput {
  url: string;
  chainId: bigint;
  assetId: bigint;
  amount: bigint;
  /// See `StoredClaimLink.derived`.
  derived?: boolean;
}

/// Persist a link and return its id. Call before broadcasting.
/// At capacity this drops the oldest record: callers check `nextEvicted` first.
export function rememberClaimLink(input: RememberClaimLinkInput, now = Date.now()): string {
  const record: StoredClaimLink = {
    id: crypto.randomUUID(),
    url: input.url,
    chainId: input.chainId.toString(),
    assetId: input.assetId.toString(),
    amount: input.amount.toString(),
    createdAt: now,
    ...(input.derived ? { derived: true as const } : {}),
  };

  persist([record, ...claimLinksSnapshot()], now);
  log.debug("remembered claim link", record.id, `chain=${record.chainId}`);
  return record.id;
}

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
