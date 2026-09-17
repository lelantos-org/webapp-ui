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
}

const DECIMAL = /^\d+$/;

/// A stored `bigint` field. Checked: a `BigInt` throw in render takes down the vault.
function isDigitString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalTimestamp(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is StoredClaimLink {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;

  if (!isNonEmptyString(r.id)) return false;
  if (!isNonEmptyString(r.url)) return false;
  if (!isDigitString(r.chainId)) return false;
  if (!isDigitString(r.assetId)) return false;
  if (!isDigitString(r.amount)) return false;
  if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) return false;
  if (!isOptionalTimestamp(r.copiedAt)) return false;
  return r.txHash === undefined || typeof r.txHash === "string";
}

export function isRecordArray(value: unknown): value is StoredClaimLink[] {
  return Array.isArray(value) && value.every(isRecord);
}
