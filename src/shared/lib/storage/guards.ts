// Field checks for records read back from storage.

const DECIMAL = /^\d+$/;

/// A stored `bigint` field. Checked: a `BigInt` throw in render takes down the whole list.
export function isDigitString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isOptionalTimestamp(value: unknown): value is number | undefined {
  return value === undefined || isTimestamp(value);
}
