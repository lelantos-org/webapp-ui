import { PUBLIC_IN_MAX } from "@lelantos-org/sdk/core";

const AMOUNT_FORMATTER = new Intl.NumberFormat("en-US", {
  useGrouping: true,
  maximumFractionDigits: 0,
});

export function shortAddr(a?: string, n = 6): string {
  if (!a) return "";
  if (a.length <= 2 * n + 2) return a;
  return `${a.slice(0, n + 2)}…${a.slice(-n)}`;
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
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const wholeStr = AMOUNT_FORMATTER.format(whole);
  if (frac === 0n) return neg ? `-${wholeStr}` : wholeStr;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${wholeStr}.${fracStr}`;
}

/// Fractional digits `formatDecimalCompact` keeps for `value`.
///
/// Exposed so a derived figure can be rendered at least as finely as the figures
/// it was derived from. A sum shown coarser than its addends reads as incorrect
/// arithmetic rather than as rounding: a 0.0025 protocol fee plus a 0.00000002
/// relayer fee totalling "0.0025" appears to have dropped one of them.
///
/// Feed the result back in as `maxFrac` on the derived figure.
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
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const sign = neg ? "-" : "";
  const wholeStr = AMOUNT_FORMATTER.format(whole);
  if (frac === 0n) return `${sign}${wholeStr}`;
  const digits = frac.toString().padStart(decimals, "0");
  const fracStr = digits.slice(0, compactFracDigits(value, decimals, maxFrac)).replace(/0+$/, "");
  return fracStr === "" ? `${sign}${wholeStr}` : `${sign}${wholeStr}.${fracStr}`;
}

/// Parse a user-typed decimal string (`"1.5"`, `"1,234.567"`) into a bigint
/// quantity scaled by `decimals`. Throws on malformed input, or when the
/// fractional part exceeds `decimals` digits.
export function parseDecimal(input: string, decimals: number): bigint {
  const t = input.replaceAll(",", "").replaceAll("_", "").trim();
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error("amount must be a non-negative number");
  if (decimals <= 0) {
    // Throws rather than discarding the fractional digits, matching every other
    // precision-loss path in this module. Reachable because `decimals` falls
    // back to `scaleToDecimals(scale)` when the registry omits it, which is 0
    // for `scale === 1n`, and zod only checks that the string is decimal-shaped.
    if (t.includes(".")) throw new Error("this asset has no fractional units");
    return BigInt(t);
  }
  const [whole, frac = ""] = t.split(".");
  if (frac.length > decimals) {
    throw new Error(`too many fractional digits (max ${decimals})`);
  }
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded);
}

export function isDecimalString(s: string): boolean {
  return /^\d+(\.\d+)?$/.test(s.replaceAll(",", "").replaceAll("_", "").trim());
}

/// MASP encodes `publicIn` and `publicOut` as `uint48` on-chain in circuit units
/// (`MASP.sol :: PublicInTooLarge` checks the circuit-units value, not base
/// units). Amounts above this cap must be rejected before submission; on-chain
/// they fail as an opaque `execution reverted` after gas is paid.
///
/// Re-exported from the SDK, which tracks the contract bound.
export { PUBLIC_IN_MAX };

export function exceedsPublicInLimit(circuitUnits: bigint): boolean {
  return circuitUnits > PUBLIC_IN_MAX;
}

/// Parse a decimal string into circuit units for an asset. `decimals` is the
/// ERC-20 token's `decimals()`; `scale` is the registry-provided circuit→base
/// multiplier. Throws when the input has finer precision than the asset can
/// represent (`base % scale !== 0`).
export function parseAmountForAsset(input: string, decimals: number, scale: bigint): bigint {
  const base = parseDecimal(input, decimals);
  if (scale > 1n && base % scale !== 0n) {
    throw new Error("amount precision exceeds asset granularity");
  }
  return scale > 1n ? base / scale : base;
}

/// Inverse of `parseAmountForAsset`: render an asset quantity in circuit units as
/// a decimal string.
export function formatAmountForAsset(
  circuitUnits: bigint,
  decimals: number,
  scale: bigint,
): string {
  return formatDecimal(scale > 1n ? circuitUnits * scale : circuitUnits, decimals);
}

/// `${formattedAmount} ${symbol}` for a registered asset.
export function formatAssetAmount(
  amount: bigint,
  asset: { decimals: number; scale: bigint; symbol: string },
): string {
  return `${formatAmountForAsset(amount, asset.decimals, asset.scale)} ${asset.symbol}`;
}

export function isPositiveIntegerString(s: string): boolean {
  return /^\d+$/.test(s.replaceAll(",", "").replaceAll("_", "").trim());
}

/// Compact relative time. Recomputed only when the caller re-renders.
const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
export function relativeTime(from: number, now: number = Date.now()): string {
  const sec = Math.round((from - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return RTF.format(sec, "second");
  if (abs < 3600) return RTF.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(sec / 3600), "hour");
  return RTF.format(Math.round(sec / 86400), "day");
}

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/// Smallest figure `formatUsd` prints as a number. Below this it renders
/// `<$0.01`, since `$0.00` reads as a measured zero.
const USD_MIN_DISPLAY = 0.005;

/// Render a USD figure. `<$0.01` for a non-zero amount too small to show, and
/// a plain `$0.00` only for an actual zero.
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs === 0) return USD_FORMATTER.format(0);
  if (abs < USD_MIN_DISPLAY) return value < 0 ? ">-$0.01" : "<$0.01";
  return USD_FORMATTER.format(value);
}

/// USD value of `circuitUnits` of an asset priced at `priceUsd` per whole token.
///
/// Mirrors `formatAmountForAsset`: balances are held in circuit units, so `scale`
/// converts to base units before `decimals` converts to whole tokens. Omitting
/// that step understates every asset whose `scale > 1`.
///
/// The bigint is split into whole and fractional parts before either reaches
/// `Number`. Converting the base-unit value directly would round an 18-decimal
/// balance past `Number.MAX_SAFE_INTEGER`, losing dollars from the integer part
/// for precision on a fraction of a cent.
export function usdValue(
  circuitUnits: bigint,
  decimals: number,
  scale: bigint,
  priceUsd: number,
): number {
  const base = scale > 1n ? circuitUnits * scale : circuitUnits;
  if (decimals <= 0) return Number(base) * priceUsd;
  const div = 10n ** BigInt(decimals);
  const neg = base < 0n;
  const abs = neg ? -base : base;
  const tokens = Number(abs / div) + Number(abs % div) / Number(div);
  return (neg ? -tokens : tokens) * priceUsd;
}
