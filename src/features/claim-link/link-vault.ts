// Local record of claim links this browser generated.
//
// A claim link is a bearer instrument: the ephemeral spending key lives only in
// the URL fragment, and the sender's copy of it lived only in React state. That
// state dies on any chain or account switch — `HomeLayout` unmounts the whole
// form subtree when the wallet leaves `ready` — and the window is wide open,
// because the flow deliberately dwells on the success screen for over a second
// after the transfer resolves. Lose it there and the funds sit at an ephemeral
// address whose key no longer exists anywhere. There is no recovery path.
//
// So the key is written to `localStorage` *before* the transfer is broadcast,
// and the tx hash is filled in afterwards. A record with no `txHash` means the
// transfer may or may not have landed — which is exactly the case that needs
// the key most.
//
// This is a real trade, not a free win: it moves a spending key from memory to
// disk, where it outlives the tab. It is the sender's own key to their own
// funds, it only matters until the recipient claims, and `forgetClaimLink` is
// wired to the UI so it can be dropped the moment it has been handed over. The
// alternative — a key that exists in exactly one place, on screen, for a few
// seconds — loses money.
//
// Layout, top to bottom: the stored shape and its validator, pure helpers over
// a record list, the module's mutable cache, the subscription, the single write
// path, and the exported API. Everything above `cache` is pure and testable in
// isolation; everything that mutates is in one block.

import { createLogger } from "@/shared/lib/logger";
import { localStore, readJson, writeJson } from "@/shared/lib/storage";

/// Never given a record's `url`: that string *is* the bearer secret, and this
/// logger writes to a console that gets screenshotted and pasted into issues.
/// Ids, counts and tx hashes only.
const log = createLogger("claim-links");

const KEY = "lelantos:claim-links:v1";

/// Records older than this are dropped on the next write.
///
/// A month is far longer than any link should stay unclaimed, and the bound
/// matters more than its exact value: without one, every link a wallet ever
/// sent accumulates on disk forever.
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/// Cap on retained records, newest kept.
const MAX_RECORDS = 50;

export interface StoredClaimLink {
  /// Random, not derived from the key material.
  id: string;
  /// The full claim URL, bearer secret and all. This is the point of the record.
  url: string;
  /// Decimal strings: `bigint` has no JSON representation.
  chainId: string;
  assetId: string;
  /// Circuit units, as passed to `transfer`.
  amount: string;
  createdAt: number;
  /// Absent until the transfer is broadcast. Absent *and* old means the
  /// transfer probably never went out — the link is then harmless, but it is
  /// shown rather than hidden, because the alternative is hiding a live one.
  txHash?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const DECIMAL = /^\d+$/;

/// A `bigint` field in its stored form.
///
/// The digit check is not cosmetic: the row renderer calls `BigInt(amount)`
/// while React is rendering, and `BigInt` throws `SyntaxError` on anything that
/// is not a numeric literal. A single hand-edited or half-written entry took
/// down the whole send-link tab — including the list that is the only remaining
/// copy of every *other* link's key.
function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/// One check per line, each with its own early return, so a breakpoint here
/// lands on the field that actually failed. A single chained `&&` expression
/// could only tell you that *something* was wrong.
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

/// Within the retention window. The one place the TTL comparison is written.
function isLive(record: StoredClaimLink, now: number): boolean {
  return now - record.createdAt < TTL_MS;
}

function newestFirst(a: StoredClaimLink, b: StoredClaimLink): number {
  return b.createdAt - a.createdAt;
}

/// The canonical stored form: live records only, newest first, capped.
///
/// Applied on every write and reused by `pruneExpiredClaimLinks`, so "what is
/// on disk" has exactly one definition.
function normalize(records: readonly StoredClaimLink[], now: number): StoredClaimLink[] {
  return records
    .filter((r) => isLive(r, now))
    .sort(newestFirst)
    .slice(0, MAX_RECORDS);
}

/// Parse the stored payload, newest first.
///
/// A pure read: pruning happens on write. `list` used to prune and rewrite as a
/// side effect, which made a plain read order-dependent and forced callers to
/// avoid calling it during render.
///
/// One bad entry discards the batch rather than salvaging around it:
/// `isRecordArray` is all-or-nothing, so a partially-written array reads as
/// absent and the next write replaces it. A record is only ever recoverable
/// from the URL the user already holds, so there is nothing to reconstruct
/// element-wise.
function parse(): StoredClaimLink[] {
  const stored = readJson(localStore, KEY, isRecordArray);
  if (!stored) {
    // Distinguished from "no key at all", which is the ordinary first-run case
    // and says nothing. `readJson` already logs a JSON syntax error; this is
    // the schema rejection it cannot see.
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
// All of it, in one object, so a `console.log(cache)` in the devtools tells the
// whole story of what this module currently believes.
// ---------------------------------------------------------------------------

interface Cache {
  /// The raw stored string `records` was parsed from. `useSyncExternalStore`
  /// compares snapshots by identity and re-renders whenever one changes, so
  /// returning a freshly-parsed array on every call would loop forever. Keying
  /// on the raw string rather than on our own writes keeps the cache correct no
  /// matter who wrote last — another tab, a devtools edit, a test clearing
  /// storage — with no separate invalidation path to keep in step.
  raw: string | undefined;
  /// Stable identity between changes; handed straight to React.
  records: StoredClaimLink[];
  /// Set once a write has failed to reach `localStorage`, cleared once one
  /// lands.
  ///
  /// `SafeStorage` swallows the two ways a write fails — Safari private mode
  /// and a spent quota — and reports `false`. `persist` used to ignore that and
  /// publish anyway, so the next snapshot re-read storage, found the *old*
  /// string still there, and handed back the records from before the write. The
  /// visible result was the worst one this module has: `rememberClaimLink`
  /// returned normally, the transfer went out, and the only copy of the bearer
  /// key never appeared in the recovery list.
  ///
  /// While set, storage is not consulted: `records` is the only copy there is,
  /// and re-reading would discard it. Records then live no longer than the tab
  /// — a real loss, but a list that dies with the tab beats an empty one while
  /// the funds are already gone.
  mirrorOnly: boolean;
}

const cache: Cache = { raw: undefined, records: [], mirrorOnly: false };

// ---------------------------------------------------------------------------
// Subscription
//
// `localStorage` fires no event for same-document writes, so the vault
// publishes its own. Without it every reader needs a "something might have
// changed" signal threaded down as a prop — noisy, and easy to forget at a new
// call site.
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

// Another tab writing the same key does not run our `persist`, so it has to be
// observed. This matters here more than for a typical cache: a second tab can
// add a link whose key exists nowhere else.
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

  // The cache is set from `kept` directly rather than by re-reading, so the
  // snapshot is right even when the store below refuses the write.
  cache.records = kept;

  if (writeJson(localStore, KEY, kept)) {
    cache.raw = localStore.get(KEY);
    // Cleared on success, not latched forever: a quota can be freed by another
    // origin's eviction, and staying in mirror mode past that would keep
    // discarding records at the end of the tab's life for no reason.
    if (cache.mirrorOnly) log.info("localStorage writable again; claim links persist once more");
    cache.mirrorOnly = false;
  } else if (!cache.mirrorOnly) {
    // Loud, and once per outage rather than once per write: these records are
    // the only copy of a spending key, and they now die with the tab.
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
    // Reachable: the record can have been pruned, evicted by `MAX_RECORDS`, or
    // forgotten in another tab between the write and the broadcast. Nothing to
    // repair — the link is already on screen — but worth seeing.
    log.warn("no stored claim link to mark broadcast", id);
    return;
  }

  persist(
    records.map((r) => (r.id === id ? { ...r, txHash } : r)),
    now,
  );
  log.debug("claim link broadcast", id, txHash);
}

/// Drop one record. The user's way of saying the link has been handed over.
export function forgetClaimLink(id: string, now = Date.now()): void {
  persist(
    claimLinksSnapshot().filter((r) => r.id !== id),
    now,
  );
  log.debug("forgot claim link", id);
}

/// Drop records past the TTL, and report whether any went.
///
/// Pruning happens on write, which is fine for a wallet that keeps sending
/// links and useless for one that sent a single link and stopped: that record's
/// spending key sat on disk indefinitely, filtered out of every view by
/// `selectClaimLinks` but never actually removed. Callers run this from an
/// effect — never during render, which is what made the old prune-inside-`list`
/// a problem in the first place.
export function pruneExpiredClaimLinks(now = Date.now()): boolean {
  const records = claimLinksSnapshot();
  const kept = normalize(records, now);

  // Writing unconditionally would publish on every mount, and `persist` hands
  // back a fresh array each time — a new snapshot identity, so
  // `useSyncExternalStore` re-renders and the effect that called this runs
  // again.
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
