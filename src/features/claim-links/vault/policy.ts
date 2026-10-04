import { DAY_MS } from "@/shared/lib/format/time";
import type { StoredClaimLink } from "./record";

/// Records older than this are dropped. A week: each `url` is a live spending key, readable by
/// any script on this origin while stored.
const TTL_MS = 7 * DAY_MS;

/// Cap on retained records, newest kept.
const MAX_RECORDS = 50;

function isLive(record: StoredClaimLink, now: number): boolean {
  return now - record.createdAt < TTL_MS;
}

export function newestFirst(a: StoredClaimLink, b: StoredClaimLink): number {
  return b.createdAt - a.createdAt;
}

/// The canonical stored form: live records only, newest first, capped.
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

/// How close the vault is to dropping a record, from the same limits as `normalize`. Browser-wide.
export interface ClaimLinkPressure {
  /// Live records across every chain.
  count: number;
  capacity: number;
  ttlMs: number;
  /// Records that will age out within `soonMs`.
  expiringSoon: number;
  /// Milliseconds until the oldest live record ages out. Absent when empty.
  oldestExpiresIn: number | undefined;
  /// Free slots under the cap; one link beyond this evicts the oldest.
  roomLeft: number;
  /// The record the next `rememberClaimLink` would drop; absent while there is room.
  nextEvicted: StoredClaimLink | undefined;
  /// Live records whose key is random rather than derived from the wallet: dropping one loses it.
  unrecoverable: number;
}

const EXPIRING_SOON_MS = DAY_MS;

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
    unrecoverable: live.filter((r) => !r.derived).length,
  };
}

/// Every live record on every chain, oldest first — the order they drop in.
export function selectVaultLinks(
  records: readonly StoredClaimLink[],
  now = Date.now(),
): StoredClaimLink[] {
  return records.filter((r) => isLive(r, now)).sort((a, b) => a.createdAt - b.createdAt);
}
