import {
  isDigitString,
  isNonEmptyString,
  isOptionalTimestamp,
  isTimestamp,
} from "@/shared/lib/storage/guards";

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
  /// Absent until broadcast. Such records are still shown: hiding them risks hiding a live link.
  txHash?: string;
  /// When the link last left this browser via a copy or share. Absent: possibly the only copy.
  copiedAt?: number;
  /// The key derives from the sender's wallet, so the wallet can find the link again while it is
  /// unclaimed. Absent on a link made with a random key: its record is the only copy.
  derived?: true;
}

function isRecord(value: unknown): value is StoredClaimLink {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;

  if (!isNonEmptyString(r.id)) return false;
  if (!isNonEmptyString(r.url)) return false;
  if (!isDigitString(r.chainId)) return false;
  if (!isDigitString(r.assetId)) return false;
  if (!isDigitString(r.amount)) return false;
  if (!isTimestamp(r.createdAt)) return false;
  if (!isOptionalTimestamp(r.copiedAt)) return false;
  if (r.derived !== undefined && r.derived !== true) return false;
  return r.txHash === undefined || typeof r.txHash === "string";
}

export function isRecordArray(value: unknown): value is StoredClaimLink[] {
  return Array.isArray(value) && value.every(isRecord);
}
