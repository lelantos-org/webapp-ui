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

import { localStore, readJson, writeJson } from "@/shared/lib/storage";

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

/// The three `bigint`-as-string fields, checked shape-first.
///
/// Not cosmetic: the row renderer calls `BigInt(record.amount)` while React is
/// rendering, and `BigInt` throws a `SyntaxError` on anything that is not a
/// numeric literal. A single hand-edited or half-written entry therefore took
/// down the whole send-link tab — including the list that is the only remaining
/// copy of every *other* link's key. Rejecting it at the boundary keeps the bad
/// record out instead of letting it reach a render.
const DIGITS = /^\d+$/;

function isRecord(value: unknown): value is StoredClaimLink {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.url === "string" &&
    typeof r.chainId === "string" &&
    DIGITS.test(r.chainId) &&
    typeof r.assetId === "string" &&
    DIGITS.test(r.assetId) &&
    typeof r.amount === "string" &&
    DIGITS.test(r.amount) &&
    typeof r.createdAt === "number" &&
    Number.isFinite(r.createdAt) &&
    (r.txHash === undefined || typeof r.txHash === "string")
  );
}

function isRecordArray(value: unknown): value is StoredClaimLink[] {
  return Array.isArray(value) && value.every(isRecord);
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
  const raw = readJson(localStore, KEY, isRecordArray);
  return raw ? [...raw].sort((a, b) => b.createdAt - a.createdAt) : [];
}

// `localStorage` fires no event for same-document writes, so the vault
// publishes its own. Without it every reader needs a "something might have
// changed" signal threaded down as a prop — noisy, and easy to forget at a new
// call site.

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

/// Cached parse, keyed on the raw stored string.
///
/// `useSyncExternalStore` compares snapshots by identity and re-renders
/// whenever it changes, so returning a freshly-parsed array on every call would
/// loop forever. Invalidating on the raw string rather than on our own writes
/// keeps the cache correct no matter who wrote last — another tab, a devtools
/// edit, a test clearing storage — with no separate invalidation path to keep
/// in step.
let cachedRaw: string | undefined;
let cachedRecords: StoredClaimLink[] = [];

/// Set once a write has failed to reach `localStorage`.
///
/// `SafeStorage` swallows the two ways that happens — Safari private mode and a
/// spent quota — and reports `false`. `write` used to ignore that and notify
/// anyway, so the next `claimLinksSnapshot` re-read storage, found the *old*
/// string still there, and handed back the records from before the write. The
/// visible result was the worst one this module has: `rememberClaimLink`
/// returned normally, the transfer went out, and the only copy of the bearer
/// key never appeared in the recovery list.
///
/// After a failed write the in-memory copy is the only copy, so storage stops
/// being consulted. Records then live no longer than the tab, which is a real
/// loss — but a visible list that dies with the tab beats an empty one while
/// the funds are already gone.
let mirrorOnly = false;

/// Persist `records`, dropping expired ones and capping the total.
function write(records: StoredClaimLink[], now = Date.now()): void {
  const kept = records
    .filter((r) => now - r.createdAt < TTL_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_RECORDS);

  // The cache is updated from `kept` directly rather than by re-reading, so the
  // snapshot is right even when the write below does not land.
  cachedRecords = kept;
  if (writeJson(localStore, KEY, kept)) {
    cachedRaw = localStore.get(KEY);
    // Cleared on success, not latched forever: a quota can be freed by another
    // origin's eviction, and staying in mirror mode after that would keep
    // discarding records at the end of the tab's life for no reason.
    mirrorOnly = false;
  } else {
    mirrorOnly = true;
  }

  notify();
}

// Another tab writing the same key does not run our `write`, so it has to be
// observed. This matters here more than for a typical cache: a second tab can
// add a link whose key exists nowhere else.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) notify();
  });
}

/// Every stored record, newest first, with a stable identity between changes.
export function claimLinksSnapshot(): StoredClaimLink[] {
  if (mirrorOnly) return cachedRecords;
  const raw = localStore.get(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedRecords = parse();
  }
  return cachedRecords;
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
  const kept = records.filter((r) => now - r.createdAt < TTL_MS);
  // Writing unconditionally would notify on every mount, and `write` hands back
  // a fresh array each time — a new snapshot identity, so `useSyncExternalStore`
  // re-renders, and the effect that called this runs again.
  if (kept.length === records.length) return false;
  write(kept, now);
  return true;
}

export interface RememberClaimLinkInput {
  url: string;
  chainId: bigint;
  assetId: bigint;
  amount: bigint;
}

/// Persist a link and return its id. Call **before** broadcasting.
export function rememberClaimLink(input: RememberClaimLinkInput): string {
  const record: StoredClaimLink = {
    id: crypto.randomUUID(),
    url: input.url,
    chainId: input.chainId.toString(),
    assetId: input.assetId.toString(),
    amount: input.amount.toString(),
    createdAt: Date.now(),
  };
  write([record, ...claimLinksSnapshot()]);
  return record.id;
}

/// Attach the tx hash once the transfer is out.
export function markClaimLinkBroadcast(id: string, txHash: string): void {
  const records = [...claimLinksSnapshot()];
  const i = records.findIndex((r) => r.id === id);
  if (i < 0) return;
  records[i] = { ...records[i], txHash };
  write(records);
}

/// Links generated on `chainId`, newest first. Expired records are filtered out
/// of the answer; they are removed from storage by the next write.
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
  return records.filter((r) => r.chainId === wanted && now - r.createdAt < TTL_MS);
}

/// Drop one record. The user's way of saying the link has been handed over.
export function forgetClaimLink(id: string): void {
  write(claimLinksSnapshot().filter((r) => r.id !== id));
}
