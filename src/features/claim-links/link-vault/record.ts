// The stored shape of a claim-link record, and the check a stored payload has to
// pass before it is trusted.

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
  /// Absent until the transfer is broadcast. Absent and old likely means the
  /// transfer never went out; such records are still shown, since hiding them
  /// risks hiding a live link.
  txHash?: string;
  /// When the link last left this browser through a copy or a share.
  ///
  /// The nearest thing to "handed over" the app can observe — nothing reports a
  /// claim — and what "Clear the ones you have shared" selects on. Absent means
  /// the link has never been copied, which is exactly the record most likely to
  /// be the only copy there is.
  copiedAt?: number;
}

// Validation

const DECIMAL = /^\d+$/;

/// A `bigint` field in its stored form.
///
/// The digit check guards the row renderer, which calls `BigInt(amount)` during
/// render. `BigInt` throws `SyntaxError` on a non-numeric literal, taking down
/// the vault and with it the only remaining copy of every other link's key.
function isDigitString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalTimestamp(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

/// One check per line with its own early return, so a breakpoint identifies the
/// field that failed.
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
