import { isNameLabel } from "@lelantos-org/sdk/protocol";
import { isNonEmptyString, isTimestamp } from "@/shared/lib/storage/guards";

/// One handle an account claimed from this browser. Everything in it is public on-chain.
export interface ClaimedHandle {
  /// The bare label, lowercase.
  label: string;
  /// The shielded address published under it when it was claimed.
  address: string;
  claimedAt: number;
}

function isRecord(value: unknown): value is ClaimedHandle {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  if (typeof r.label !== "string" || !isNameLabel(r.label)) return false;
  if (!isNonEmptyString(r.address)) return false;
  return isTimestamp(r.claimedAt);
}

export function isRecordArray(value: unknown): value is ClaimedHandle[] {
  return Array.isArray(value) && value.every(isRecord);
}
