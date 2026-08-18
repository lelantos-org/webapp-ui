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

function isRecord(value: unknown): value is StoredClaimLink {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.url === "string" &&
    typeof r.chainId === "string" &&
    typeof r.assetId === "string" &&
    typeof r.amount === "string" &&
    typeof r.createdAt === "number"
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

/// Persist `records`, dropping expired ones and capping the total.
function write(records: StoredClaimLink[], now = Date.now()): void {
  const kept = records
    .filter((r) => now - r.createdAt < TTL_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_RECORDS);
  writeJson(localStore, KEY, kept);
  for (const listener of listeners) listener();
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

// Another tab writing the same key does not run our `write`, so it has to be
// observed. This matters here more than for a typical cache: a second tab can
// add a link whose key exists nowhere else.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) notify();
  });
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

/// Every stored record, newest first, with a stable identity between changes.
export function claimLinksSnapshot(): StoredClaimLink[] {
  const raw = localStore.get(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedRecords = parse();
  }
  return cachedRecords;
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
