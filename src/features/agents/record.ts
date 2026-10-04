import {
  isDigitString,
  isNonEmptyString,
  isOptionalTimestamp,
  isTimestamp,
} from "@/shared/lib/storage/guards";

/// One agent wallet this browser funded. `nsk` is a live spending key, kept so the
/// operator can read the balance and sweep the funds back.
export interface StoredAgent {
  /// Random, not derived from the key material.
  id: string;
  /// The operator's name for it. Shown everywhere; never sent anywhere.
  label: string;
  /// Decimal string: `bigint` has no JSON representation.
  chainId: string;
  /// Where funds are sent. Not secret.
  address: string;
  /// The bearer spending key, hex. The agent holds a copy; this is the other one.
  nsk: string;
  createdAt: number;
  /// Set once swept. Kept, not deleted, so a revoked agent stays auditable.
  revokedAt?: number;
  /// When the credential last left this browser. Absent: possibly the only copy.
  copiedAt?: number;
}

const NSK_HEX = /^0x[0-9a-fA-F]+$/;

/// Checked field by field: a `BigInt` throw in render would take down the whole list.
function isRecord(value: unknown): value is StoredAgent {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;

  if (!isNonEmptyString(r.id)) return false;
  if (!isNonEmptyString(r.label)) return false;
  if (!isDigitString(r.chainId)) return false;
  if (!isNonEmptyString(r.address)) return false;
  if (typeof r.nsk !== "string" || !NSK_HEX.test(r.nsk)) return false;
  if (!isTimestamp(r.createdAt)) return false;
  if (!isOptionalTimestamp(r.revokedAt)) return false;
  return isOptionalTimestamp(r.copiedAt);
}

export function isRecordArray(value: unknown): value is StoredAgent[] {
  return Array.isArray(value) && value.every(isRecord);
}
