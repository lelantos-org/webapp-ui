import type { RegisteredAsset } from "@/config/chains";
import { findAsset } from "@/features/assets";
import { formatAssetAmount } from "@/shared/lib/format/asset";
import { DAY_MS, relativeTime } from "@/shared/lib/format/time";
import { numberWord } from "@/shared/lib/format/words";
import type { ClaimLinkPressure } from "./policy";
import type { StoredClaimLink } from "./record";

const VAULT_WARN_ROOM = 5;

const DROP_WARN_MS = 2 * DAY_MS;

/// Label for a stored amount, or the raw figure with its asset id when unregistered.
/// `BigInt` is safe in render: the store rejects non-digit amounts.
export function describeStoredAmount(
  link: StoredClaimLink,
  assets: readonly RegisteredAsset[],
): string {
  const asset = findAsset(assets, link.assetId);
  return asset
    ? formatAssetAmount(BigInt(link.amount), asset)
    : `${link.amount} (asset #${link.assetId})`;
}

/// A whole number of days, "7 days" / "1 day".
export function daysLabel(ms: number): string {
  const days = Math.max(1, Math.round(ms / DAY_MS));
  return `${days} day${days === 1 ? "" : "s"}`;
}

export type VaultTone = "neutral" | "err";

/// How full the vault is, as the width of its meter: 0–100.
export function vaultFillPct(p: ClaimLinkPressure): number {
  return p.capacity > 0 ? Math.min(100, (p.count / p.capacity) * 100) : 0;
}

export function vaultTone(p: ClaimLinkPressure): VaultTone {
  return p.roomLeft <= VAULT_WARN_ROOM ? "err" : "neutral";
}

/// The capacity box's first line. Browser-wide, as the cap is.
export function capacityHeadline(p: ClaimLinkPressure): string {
  return `This browser keeps ${p.capacity} links across every network. You have ${p.count}.`;
}

export function capacityBody(p: ClaimLinkPressure): string {
  const ttl = daysLabel(p.ttlMs);
  const loss =
    "a dropped record cannot be recovered — the funds would sit at an address whose key nobody holds";
  if (p.roomLeft === 0) {
    return `The next link you create drops the oldest record to make room, and ${loss}. Records also drop on their own after ${ttl}.`;
  }
  if (vaultTone(p) === "err") {
    const n = p.roomLeft + 1;
    return `Creating ${numberWord(n)} more link${n === 1 ? "" : "s"} will drop the oldest records to make room, and ${loss}. Records also drop on their own after ${ttl}.`;
  }
  return `Records drop on their own after ${ttl}, and once the browser is full the oldest goes first. Export anything you still need to send.`;
}

/// The row badge for a record near its drop, or `undefined` while it is not.
export function dropsBadge(expiresInMs: number): string | undefined {
  if (expiresInMs > DROP_WARN_MS) return undefined;
  if (expiresInMs <= DAY_MS) return "drops within a day";
  return `drops in ${Math.ceil(expiresInMs / DAY_MS)} days`;
}

/// The result card's retention promise. Never "until it's claimed": the browser cannot know.
export function retentionSentence(ttlMs: number): string {
  return `Works once. We keep a copy in this browser for ${daysLabel(ttlMs)} or until you delete it.`;
}

/// What creating one more link would cost, naming the record it drops.
export function evictionSentence(
  record: StoredClaimLink,
  assets: readonly RegisteredAsset[],
  now = Date.now(),
): string {
  return `This browser is full. Creating this link drops your oldest record — ${describeStoredAmount(record, assets)}, made ${relativeTime(record.createdAt, now)} — and its key cannot be recovered.`;
}
