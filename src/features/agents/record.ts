/// One agent wallet this browser funded.
///
/// `nsk` is a live spending key. It is here because the operator needs two things
/// from it after funding — the balance, and the ability to sweep it back — and
/// neither is possible from the shielded address alone.
export interface StoredAgent {
  /// Random, not derived from the key material.
  id: string;
  /// The operator's name for it. Shown everywhere; never sent anywhere.
  label: string;
  /// Decimal strings: `bigint` has no JSON representation.
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

const DECIMAL = /^\d+$/;
const NSK_HEX = /^0x[0-9a-fA-F]+$/;

function isDigitString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalTimestamp(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

/// Checked field by field: a `BigInt` throw in render would take down the whole list.
function isRecord(value: unknown): value is StoredAgent {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;

  if (!isNonEmptyString(r.id)) return false;
  if (!isNonEmptyString(r.label)) return false;
  if (!isDigitString(r.chainId)) return false;
  if (!isNonEmptyString(r.address)) return false;
  if (typeof r.nsk !== "string" || !NSK_HEX.test(r.nsk)) return false;
  if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) return false;
  if (!isOptionalTimestamp(r.revokedAt)) return false;
  return isOptionalTimestamp(r.copiedAt);
}

export function isRecordArray(value: unknown): value is StoredAgent[] {
  return Array.isArray(value) && value.every(isRecord);
}
