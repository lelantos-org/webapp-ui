// What the vault may hold, and how close it is to dropping something.
//
// Pure: every rule about retention — the TTL, the cap, the order records drop
// in — is stated here once, and both the write path (`store.ts`) and the
// warnings on screen read it, so a warning cannot disagree with what the next
// write will do.

import { DAY_MS } from "@/shared/lib/format/time";
import type { StoredClaimLink } from "./record";

/// Records older than this are dropped on the next write.
///
/// A week, not a month. Each record's `url` carries a live spending key, so this
/// window is not really about bounding growth on disk — it is how long a bearer
/// secret for unclaimed funds stays readable by any script on this origin, long
/// after the tab that needed it closed. A link unclaimed after a week is far
/// more likely forgotten than in flight, and the recipient's copy is unaffected
/// either way: pruning here drops the *sender's* safety copy, not the link.
///
/// Not the primary control. `forgetClaimLink` is, and it fires as soon as the
/// link has been handed over; the TTL is the backstop for the records that never
/// reach it.
///
/// Every sentence on screen that names the window is derived from this (through
/// `ClaimLinkPressure.ttlMs`), so shortening it cannot leave copy promising the
/// old figure.
const TTL_MS = 7 * DAY_MS;

/// Cap on retained records, newest kept.
const MAX_RECORDS = 50;

/// Within the retention window. Sole site of the TTL comparison.
function isLive(record: StoredClaimLink, now: number): boolean {
  return now - record.createdAt < TTL_MS;
}

export function newestFirst(a: StoredClaimLink, b: StoredClaimLink): number {
  return b.createdAt - a.createdAt;
}

/// The canonical stored form: live records only, newest first, capped.
///
/// Applied on every write and reused by `pruneExpiredClaimLinks`, giving a
/// single definition of what may be on disk.
export function normalize(records: readonly StoredClaimLink[], now: number): StoredClaimLink[] {
  return records
    .filter((r) => isLive(r, now))
    .sort(newestFirst)
    .slice(0, MAX_RECORDS);
}

/// Milliseconds until `record` ages out of the vault; zero or less once it has.
export function claimLinkExpiresIn(record: StoredClaimLink, now = Date.now()): number {
  return record.createdAt + TTL_MS - now;
}

/// How close this vault is to losing a record, and why.
///
/// Both limits above drop the *sender's* copy of a bearer secret, and a link the
/// sender never managed to hand over is unrecoverable once it goes — the header
/// note applies. Neither limit is wrong, but a limit that fires silently is first
/// noticed after it has been hit. This reports the pressure while there is still
/// something to do about it.
///
/// Pure, and derived from the same `TTL_MS`/`MAX_RECORDS` as `normalize`, so a
/// warning can never disagree with what the next write will actually do.
///
/// Browser-wide, not per chain: the cap counts every record on disk, so a
/// per-chain count would promise room the next write does not have.
export interface ClaimLinkPressure {
  /// Live records held right now, across every chain.
  count: number;
  /// `MAX_RECORDS`, surfaced so the UI never hardcodes a second copy.
  capacity: number;
  /// `TTL_MS`, for the same reason.
  ttlMs: number;
  /// Records that will age out within `soonMs`.
  expiringSoon: number;
  /// Milliseconds until the oldest live record ages out. Absent when empty.
  oldestExpiresIn: number | undefined;
  /// Creating this many more links would evict the oldest on the cap alone.
  roomLeft: number;
  /// The record the next `rememberClaimLink` would drop: the oldest live one,
  /// once there is no room left. Absent while there is room.
  nextEvicted: StoredClaimLink | undefined;
}

/// A day: near enough to act on, far enough not to cry wolf.
const EXPIRING_SOON_MS = DAY_MS;

/// The pressure on `records`: a snapshot the caller already holds — the one a
/// `useSyncExternalStore` subscription returned — so the figure re-renders with
/// the store rather than on whatever else happens to render its component.
export function claimLinkPressureOf(
  records: readonly StoredClaimLink[],
  now = Date.now(),
  soonMs = EXPIRING_SOON_MS,
): ClaimLinkPressure {
  const live = normalize(records, now);
  const ages = live.map((r) => claimLinkExpiresIn(r, now));
  const roomLeft = Math.max(0, MAX_RECORDS - live.length);
  return {
    count: live.length,
    capacity: MAX_RECORDS,
    ttlMs: TTL_MS,
    expiringSoon: ages.filter((ms) => ms <= soonMs).length,
    oldestExpiresIn: ages.length > 0 ? Math.min(...ages) : undefined,
    roomLeft,
    nextEvicted: roomLeft === 0 ? live.at(-1) : undefined,
  };
}

/// Every live record on every chain, oldest first — the order they drop in.
export function selectVaultLinks(
  records: readonly StoredClaimLink[],
  now = Date.now(),
): StoredClaimLink[] {
  return records.filter((r) => isLive(r, now)).sort((a, b) => a.createdAt - b.createdAt);
}
