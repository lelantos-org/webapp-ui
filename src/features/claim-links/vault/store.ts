// Local record of claim links this browser generated.
//
// A claim link is a bearer instrument: the ephemeral spending key exists only
// in the URL fragment. React state holding it is destroyed on any chain or
// account switch — `ActionScreen` remounts the form on a chain switch and drops
// it entirely when the wallet leaves `ready` — which can happen while the result
// is still on screen. Once lost, the funds sit at an ephemeral address with no
// recoverable key.
//
// The key is therefore written to `localStorage` before the transfer is
// broadcast, and the tx hash is filled in afterwards. A record with no `txHash`
// means the transfer may or may not have landed.
//
// The trade-off is a spending key on disk, outliving the tab. It is the
// sender's own key to their own funds, it matters only until the recipient
// claims, and `forgetClaimLink` drops it once the link has been handed over.
//
// This module is the vault's mutable half: the cached snapshot, the
// subscription, and the single write path. The rules it enforces on each write
// are `policy.ts`; the shape it validates is `record.ts`.

import { createSubscribers } from "@/shared/lib/external-store";
import { createLogger } from "@/shared/lib/logger";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore, readJson, writeJson } from "@/shared/lib/storage/safe";
import { newestFirst, normalize } from "./policy";
import { isRecordArray, type StoredClaimLink } from "./record";

/// Never given a record's `url`: that string is the bearer secret and console
/// output ends up in screenshots and issue reports. Ids, counts and tx hashes
/// only.
const log = createLogger("claim-links");

const KEY = LOCAL_KEYS.claimLinks;

/// Parse the stored payload, newest first. A pure read; pruning happens on
/// write, so this is safe to call during render.
///
/// `isRecordArray` is all-or-nothing: one bad entry discards the batch, which
/// then reads as absent and is replaced by the next write. Element-wise salvage
/// would gain nothing, a record being recoverable only from the URL the user
/// already holds.
function parse(): StoredClaimLink[] {
  const stored = readJson(localStore, KEY, isRecordArray);
  if (!stored) {
    // Distinguished from an absent key, which is the ordinary first-run case.
    // `readJson` already logs JSON syntax errors; this covers the schema
    // rejection it cannot see.
    if (localStore.get(KEY) !== undefined) {
      log.warn("stored claim links failed validation; treating the store as empty");
    }
    return [];
  }
  return [...stored].sort(newestFirst);
}

// Mutable state, held in a single object so the module's full state is
// inspectable at once.

interface Cache {
  /// The raw stored string `records` was parsed from. `useSyncExternalStore`
  /// compares snapshots by identity, so a freshly-parsed array on every call
  /// would re-render indefinitely. Keying on the raw string rather than on this
  /// module's own writes keeps the cache correct whatever the writer — another
  /// tab, a devtools edit, a test clearing storage — with no separate
  /// invalidation path.
  raw: string | undefined;
  /// Stable identity between changes; handed straight to React.
  records: StoredClaimLink[];
  /// Set once a write has failed to reach `localStorage`, cleared once one
  /// lands.
  ///
  /// `SafeStorage` reports `false` for the two ways a write fails: Safari
  /// private mode and a spent quota. While set, storage is not consulted, since
  /// `records` is then the only copy and re-reading would discard it. Records
  /// live no longer than the tab in that state.
  mirrorOnly: boolean;
}

const cache: Cache = { raw: undefined, records: [], mirrorOnly: false };

// Subscription. `localStorage` fires no event for same-document writes, so the
// vault publishes its own rather than requiring callers to thread a change
// signal through props.

const subscribers = createSubscribers();

export function subscribeClaimLinks(listener: () => void): () => void {
  return subscribers.subscribe(listener);
}

// A write from another tab does not run `persist`, so it is observed here: a
// second tab can add a link whose key exists nowhere else.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) subscribers.notify();
  });
}

// The write path

/// Normalize, store, and publish. The only function in the module that mutates
/// `cache` or writes to `localStorage`.
function persist(records: readonly StoredClaimLink[], now: number): void {
  const kept = normalize(records, now);

  // Set from `kept` directly rather than by re-reading, so the snapshot stays
  // correct even when the store refuses the write below.
  cache.records = kept;

  if (writeJson(localStore, KEY, kept)) {
    cache.raw = localStore.get(KEY);
    // Cleared on success rather than latched: a quota can be freed by another
    // origin's eviction, and mirror mode discards records at the end of the
    // tab's life.
    if (cache.mirrorOnly) log.info("localStorage writable again; claim links persist once more");
    cache.mirrorOnly = false;
  } else if (!cache.mirrorOnly) {
    // Once per outage rather than once per write. These records are the only
    // copy of a spending key and now die with the tab.
    log.warn(
      `localStorage refused the write — ${kept.length} claim link(s) are held in memory only ` +
        "and will not survive this tab",
    );
    cache.mirrorOnly = true;
  }

  subscribers.notify();
}

// Public API

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

/// Test seam: forget the parsed snapshot and the "storage refused the write"
/// latch, which outlive a single test. Pair it with clearing `localStorage`.
export function resetForTest(): void {
  cache.raw = undefined;
  cache.records = [];
  cache.mirrorOnly = false;
}

/// The last write did not reach `localStorage`, so every record lives only as
/// long as this tab. The vault says so, since export is then the only way to
/// keep them.
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
///
/// At capacity this drops the oldest record to make room. Callers check
/// `ClaimLinkPressure.nextEvicted` first and refuse until the user has a copy of
/// it; the vault cannot ask, since by the time it runs the transfer is about to
/// go out.
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
    // Reachable: the record may have been pruned, evicted by `MAX_RECORDS`, or
    // forgotten in another tab between the write and the broadcast. The link is
    // already on screen, so there is nothing to repair.
    log.warn("no stored claim link to mark broadcast", id);
    return;
  }

  persist(
    records.map((r) => (r.id === id ? { ...r, txHash } : r)),
    now,
  );
  log.debug("claim link broadcast", id, txHash);
}

/// Note that a link has left this browser through a copy or a share.
///
/// A no-op for a record that is gone, as `markClaimLinkBroadcast`: the copy has
/// already happened and there is nothing on disk to annotate.
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

/// Drop several records in one write — "Clear the ones you have shared".
///
/// One write rather than one per id, so another tab never observes the batch
/// half-applied, and subscribers render once.
export function forgetClaimLinks(ids: readonly string[], now = Date.now()): void {
  if (ids.length === 0) return;
  const drop = new Set(ids);
  persist(
    claimLinksSnapshot().filter((r) => !drop.has(r.id)),
    now,
  );
  log.debug(`forgot ${drop.size} claim link(s)`);
}

/// Drop records past the TTL, and report whether any went.
///
/// Pruning otherwise happens only on write, which never removes the record of a
/// wallet that sent one link and stopped: `selectVaultLinks` filters it from
/// every view while its spending key stays on disk. Call from an effect, never
/// during render.
export function pruneExpiredClaimLinks(now = Date.now()): boolean {
  const records = claimLinksSnapshot();
  const kept = normalize(records, now);

  // `persist` publishes a fresh array, which is a new snapshot identity for
  // `useSyncExternalStore`; writing unconditionally would re-render and re-run
  // the calling effect on every mount.
  if (kept.length === records.length) return false;

  persist(kept, now);
  log.debug(`pruned ${records.length - kept.length} expired claim link(s)`);
  return true;
}
