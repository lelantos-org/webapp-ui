// Local record of claim links this browser generated.
//
// A claim link is a bearer instrument: the ephemeral spending key exists only
// in the URL fragment. React state holding it is destroyed on any chain or
// account switch — `HomeLayout` unmounts the form subtree when the wallet
// leaves `ready` — which can happen while the success screen is still up. Once
// lost, the funds sit at an ephemeral address with no recoverable key.
//
// The key is therefore written to `localStorage` before the transfer is
// broadcast, and the tx hash is filled in afterwards. A record with no `txHash`
// means the transfer may or may not have landed.
//
// The trade-off is a spending key on disk, outliving the tab. It is the
// sender's own key to their own funds, it matters only until the recipient
// claims, and `forgetClaimLink` drops it once the link has been handed over.
//
// Layout, top to bottom: stored shape and validator, pure helpers over a record
// list, the mutable cache, the subscription, the single write path, the exported
// API. Everything above `cache` is pure; everything that mutates is in one
// block.

import { createLogger } from "@/shared/lib/logger";
import { localStore, readJson, writeJson } from "@/shared/lib/storage";

/// Never given a record's `url`: that string is the bearer secret and console
/// output ends up in screenshots and issue reports. Ids, counts and tx hashes
/// only.
const log = createLogger("claim-links");

const KEY = "lelantos:claim-links:v1";

/// Records older than this are dropped on the next write. Bounds unlimited
/// growth on disk; a month exceeds any reasonable unclaimed window.
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/// Cap on retained records, newest kept.
const MAX_RECORDS = 50;

export interface StoredClaimLink {
  /// Random, not derived from the key material.
  id: string;
  /// The full claim URL, including the bearer secret.
  url: string;
  /// Decimal strings: `bigint` has no JSON representation.
  chainId: string;
  assetId: string;
  /// Circuit units, as passed to `transfer`.
  amount: string;
  createdAt: number;
  /// Absent until the transfer is broadcast. Absent and old likely means the
  /// transfer never went out; such records are still shown, since hiding them
  /// risks hiding a live link.
  txHash?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const DECIMAL = /^\d+$/;

/// A `bigint` field in its stored form.
///
/// The digit check guards the row renderer, which calls `BigInt(amount)` during
/// render. `BigInt` throws `SyntaxError` on a non-numeric literal, taking down
/// the send-link tab and with it the only remaining copy of every other link's
/// key.
function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/// One check per line with its own early return, so a breakpoint identifies the
/// field that failed.
function isRecord(value: unknown): value is StoredClaimLink {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;

  if (!isNonEmptyString(r.id)) return false;
  if (!isNonEmptyString(r.url)) return false;
  if (!isDecimalString(r.chainId)) return false;
  if (!isDecimalString(r.assetId)) return false;
  if (!isDecimalString(r.amount)) return false;
  if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) return false;
  return r.txHash === undefined || typeof r.txHash === "string";
}

function isRecordArray(value: unknown): value is StoredClaimLink[] {
  return Array.isArray(value) && value.every(isRecord);
}

// ---------------------------------------------------------------------------
// Pure helpers over a record list
// ---------------------------------------------------------------------------

/// Within the retention window. Sole site of the TTL comparison.
function isLive(record: StoredClaimLink, now: number): boolean {
  return now - record.createdAt < TTL_MS;
}

function newestFirst(a: StoredClaimLink, b: StoredClaimLink): number {
  return b.createdAt - a.createdAt;
}

/// The canonical stored form: live records only, newest first, capped.
///
/// Applied on every write and reused by `pruneExpiredClaimLinks`, giving a
/// single definition of what may be on disk.
function normalize(records: readonly StoredClaimLink[], now: number): StoredClaimLink[] {
  return records
    .filter((r) => isLive(r, now))
    .sort(newestFirst)
    .slice(0, MAX_RECORDS);
}

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

// ---------------------------------------------------------------------------
// Mutable state
//
// Held in a single object so the module's full state is inspectable at once.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Subscription
//
// `localStorage` fires no event for same-document writes, so the vault
// publishes its own rather than requiring callers to thread a change signal
// through props.
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeClaimLinks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// A write from another tab does not run `persist`, so it is observed here: a
// second tab can add a link whose key exists nowhere else.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) notify();
  });
}

// ---------------------------------------------------------------------------
// The write path
// ---------------------------------------------------------------------------

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

  notify();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

export interface RememberClaimLinkInput {
  url: string;
  chainId: bigint;
  assetId: bigint;
  amount: bigint;
}

/// Persist a link and return its id. Call **before** broadcasting.
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

/// Drop one record, once the user confirms the link has been handed over.
export function forgetClaimLink(id: string, now = Date.now()): void {
  persist(
    claimLinksSnapshot().filter((r) => r.id !== id),
    now,
  );
  log.debug("forgot claim link", id);
}

/// Drop records past the TTL, and report whether any went.
///
/// Pruning otherwise happens only on write, which never removes the record of a
/// wallet that sent one link and stopped: `selectClaimLinks` filters it from
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

/// Links generated on `chainId`, newest first. Expired records are filtered out
/// of the answer; they leave storage via `pruneExpiredClaimLinks` or the next
/// write.
export function listClaimLinks(chainId: bigint, now = Date.now()): StoredClaimLink[] {
  return selectClaimLinks(claimLinksSnapshot(), chainId, now);
}

/// The `chainId` filter, over a snapshot the caller already holds.
export function selectClaimLinks(
  records: readonly StoredClaimLink[],
  chainId: bigint,
  now = Date.now(),
): StoredClaimLink[] {
  const wanted = chainId.toString();
  return records.filter((r) => r.chainId === wanted && isLive(r, now));
}
