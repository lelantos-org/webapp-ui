// Fixed-point bigints to and from decimal text.
//
// Unit-agnostic: a value here is an integer with `decimals` implied places,
// whatever it counts. Asset-aware conversions — circuit units, `scale`, the
// yield index — are `shared/domain/units`; asset-aware display is `./asset`.

const AMOUNT_FORMATTER = new Intl.NumberFormat("en-US", {
  useGrouping: true,
  maximumFractionDigits: 0,
});

/// Typed decimal text with the grouping a user may type stripped: `"1,234_5 "`
/// becomes `"12345"`. Every parser and shape check here reads input through it,
/// so they agree on what counts as the same number.
export function normalizeNumericInput(input: string): string {
  return input.replaceAll(",", "").replaceAll("_", "").trim();
}

/// `value` split at `decimals` implied places, for the two formatters that
/// differ only in how much of the fraction they keep.
///
/// `whole` is grouped; `digits` is the fraction zero-padded to `decimals`, or
/// `undefined` when there is no fraction. `decimals` must be positive.
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

/// Render a bigint amount with thousand separators. Use when no asset decimals
/// are available; otherwise prefer `formatDecimal`.
export function formatAmount(v: bigint): string {
  return AMOUNT_FORMATTER.format(v);
}

/// Format `value` — token base units, or circuit units where `scale` is 1 — as a
/// decimal string with `decimals` fractional places. Strips trailing zeros and
/// groups the integer part with thousand separators.
export function formatDecimal(value: bigint, decimals: number): string {
  if (decimals <= 0) return formatAmount(value);
  const { sign, whole, digits } = splitDecimal(value, decimals);
  if (digits === undefined) return `${sign}${whole}`;
  return `${sign}${whole}.${digits.replace(/0+$/, "")}`;
}

/// Fractional digits `formatDecimalCompact` keeps for `value`.
///
/// Exposed so a derived figure renders at least as finely as its addends. A sum
/// shown coarser reads as wrong arithmetic rather than as rounding: a 0.0025
/// protocol fee plus a 0.00000002 relayer fee totalling "0.0025" looks as though
/// one was dropped. Feed the result back in as `maxFrac` on the derived
/// figure.
export function compactFracDigits(value: bigint, decimals: number, maxFrac = 6): number {
  if (decimals <= 0) return 0;
  const abs = value < 0n ? -value : value;
  const frac = abs % 10n ** BigInt(decimals);
  if (frac === 0n) return 0;
  const digits = frac.toString().padStart(decimals, "0");
  const leadingZeros = digits.length - digits.replace(/^0+/, "").length;
  // Dust would truncate to "0" at the cap, so it extends until four significant
  // digits show; a value with a whole part stops at the cap.
  const floor = abs / 10n ** BigInt(decimals) === 0n ? leadingZeros + 4 : maxFrac;
  return Math.min(decimals, Math.max(maxFrac, floor));
}

/// Display-only variant of `formatDecimal` that caps the fractional part.
///
/// 18-decimal balances are unreadable in a hint line, so at most `maxFrac`
/// digits are kept, truncating toward zero so a balance is never shown as larger
/// than it is. Values below that cap would truncate to "0", so they instead keep
/// digits until four significant ones show.
export function formatDecimalCompact(value: bigint, decimals: number, maxFrac = 6): string {
  if (decimals <= 0) return formatAmount(value);
  const { sign, whole, digits } = splitDecimal(value, decimals);
  if (digits === undefined) return `${sign}${whole}`;
  const fracStr = digits.slice(0, compactFracDigits(value, decimals, maxFrac)).replace(/0+$/, "");
  return fracStr === "" ? `${sign}${whole}` : `${sign}${whole}.${fracStr}`;
}

/// A base-unit amount with at least `minFrac` fractional digits: `250.00`,
/// `1.50`, `0.0025`.
///
/// The figure a money screen prints next to its words. `formatDecimal` strips
/// every trailing zero, which reads well in a hint and badly on a cheque: `250`
/// beside "Two hundred fifty and 00/100" looks like a different amount from
/// `250.00`. Digits past `minFrac` are kept while they are significant, and the
/// fraction is capped at `maxFrac` the same way `formatDecimalCompact` caps it —
/// truncating, and extending for dust so a non-zero figure never prints as zero.
///
/// `minFrac` is clamped to `decimals`: an asset with no fractional units has no
/// cents to show, and `.00` on one would claim a precision it lacks.
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

/// Parse a user-typed decimal string (`"1.5"`, `"1,234.567"`) into a bigint
/// quantity scaled by `decimals`. Throws on malformed input, or when the
/// fractional part exceeds `decimals` digits.
export function parseDecimal(input: string, decimals: number): bigint {
  const t = normalizeNumericInput(input);
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error("amount must be a non-negative number");
  if (decimals <= 0) {
    // Throws rather than discarding the fractional digits, matching every other
    // precision-loss path in this module. Reachable because `decimals` falls
    // back to `scaleToDecimals(scale)` when the registry omits it, which is 0
    // for `scale === 1n`, and zod only checks that the string is decimal-shaped.
    if (t.includes(".")) throw new Error("this asset has no fractional units");
    return BigInt(t);
  }
  // The pattern above guarantees a non-empty whole part.
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
