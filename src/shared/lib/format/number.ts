const AMOUNT_FORMATTER = new Intl.NumberFormat("en-US", {
  useGrouping: true,
  maximumFractionDigits: 0,
});

/// Typed decimal text with user grouping stripped: `"1,234_5 "` becomes `"12345"`.
export function normalizeNumericInput(input: string): string {
  return input.replaceAll(",", "").replaceAll("_", "").trim();
}

/// `value` split at `decimals` (> 0) places: grouped `whole`, zero-padded `digits` or `undefined`.
function splitDecimal(
  value: bigint,
  decimals: number,
): { sign: string; whole: string; digits: string | undefined } {
  const abs = value < 0n ? -value : value;
  const base = 10n ** BigInt(decimals);
  const frac = abs % base;
  return {
    sign: value < 0n ? "-" : "",
    whole: AMOUNT_FORMATTER.format(abs / base),
    digits: frac === 0n ? undefined : frac.toString().padStart(decimals, "0"),
  };
}

/// A bigint with thousand separators, for when no decimals are known.
export function formatAmount(v: bigint): string {
  return AMOUNT_FORMATTER.format(v);
}

/// `value` as grouped decimal text with `decimals` places, trailing zeros stripped.
export function formatDecimal(value: bigint, decimals: number): string {
  if (decimals <= 0) return formatAmount(value);
  const { sign, whole, digits } = splitDecimal(value, decimals);
  if (digits === undefined) return `${sign}${whole}`;
  return `${sign}${whole}.${digits.replace(/0+$/, "")}`;
}

/// Fractional digits `formatDecimalCompact` keeps for `value`; pass as `maxFrac` to derived sums.
export function compactFracDigits(value: bigint, decimals: number, maxFrac = 6): number {
  if (decimals <= 0) return 0;
  const abs = value < 0n ? -value : value;
  const frac = abs % 10n ** BigInt(decimals);
  if (frac === 0n) return 0;
  const digits = frac.toString().padStart(decimals, "0");
  const leadingZeros = digits.length - digits.replace(/^0+/, "").length;
  const floor = abs / 10n ** BigInt(decimals) === 0n ? leadingZeros + 4 : maxFrac;
  return Math.min(decimals, Math.max(maxFrac, floor));
}

/// `formatDecimal` capped at `maxFrac` digits, truncating; dust keeps four significant digits.
export function formatDecimalCompact(value: bigint, decimals: number, maxFrac = 6): string {
  if (decimals <= 0) return formatAmount(value);
  const { sign, whole, digits } = splitDecimal(value, decimals);
  if (digits === undefined) return `${sign}${whole}`;
  const fracStr = digits.slice(0, compactFracDigits(value, decimals, maxFrac)).replace(/0+$/, "");
  return fracStr === "" ? `${sign}${whole}` : `${sign}${whole}.${fracStr}`;
}

/// A base-unit amount with at least `minFrac` (clamped to `decimals`) fractional digits: `250.00`.
export function formatFixed(
  amount: bigint,
  decimals: number,
  minFrac = 2,
  maxFrac = decimals,
): string {
  const compact = formatDecimalCompact(amount, decimals, Math.max(maxFrac, minFrac));
  const want = Math.min(minFrac, Math.max(decimals, 0));
  if (want <= 0) return compact;
  const dot = compact.indexOf(".");
  const have = dot === -1 ? 0 : compact.length - dot - 1;
  if (have >= want) return compact;
  return `${compact}${dot === -1 ? "." : ""}${"0".repeat(want - have)}`;
}

/// Parse user-typed decimal text into a bigint scaled by `decimals`. Throws on excess precision.
export function parseDecimal(input: string, decimals: number): bigint {
  const t = normalizeNumericInput(input);
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error("amount must be a non-negative number");
  if (decimals <= 0) {
    if (t.includes(".")) throw new Error("this asset has no fractional units");
    return BigInt(t);
  }
  const [whole = "", frac = ""] = t.split(".");
  if (frac.length > decimals) {
    throw new Error(`too many fractional digits (max ${decimals})`);
  }
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded);
}

export function isDecimalString(s: string): boolean {
  return /^\d+(\.\d+)?$/.test(normalizeNumericInput(s));
}

export function isPositiveIntegerString(s: string): boolean {
  return /^\d+$/.test(normalizeNumericInput(s));
}
