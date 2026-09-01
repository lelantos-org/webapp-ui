import { circuitAmount, PUBLIC_IN_MAX, RAY, toTokenUnits } from "@lelantos-org/sdk/core";

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
export function parseAmountForAsset(
  input: string,
  decimals: number,
  scale: bigint,
  index: bigint,
): bigint {
  const base = parseDecimal(input, decimals);
  // The smallest representable amount is one circuit unit, worth
  // `scale * index / RAY` base units — not `scale`. Checking against `scale`
  // alone would refuse amounts a yield asset represents perfectly well.
  const step = scale * index;
  const numer = base * RAY;
  if (step <= RAY) return base;
  if (numer % step === 0n) return numer / step;

  // Off a unit boundary. For a plain asset that is a real mistake and always
  // has been: `scale` is fixed, so anything finer was never representable and
  // silently truncating it would short the user without saying so.
  //
  // Under a moving index it is not a mistake but a fact of the arithmetic. A
  // unit is worth a non-round number of base units, so most unit counts have no
  // exact decimal at the token's `decimals` — including the one this module's
  // own `formatBalance` writes into the field for the "max" button. Throwing
  // there would break the max button on every yield asset.
  if (index === RAY) throw new Error("amount precision exceeds asset granularity");

  // Rounds **up**, being the inverse of a conversion that floored.
  // `formatAmountForAsset` writes `floor(v * step / RAY)`, so the base units it
  // produced sit at or below the exact worth of `v`; dividing back and flooring
  // a second time lands under `v` and loses a unit. The smallest unit count
  // worth at least this many base units is `ceil`, which recovers `v` exactly:
  // `ceil(floor(v * step / RAY) * RAY / step) === v` for every `v`.
  //
  // The round trip is not cosmetic. The "max" button and the denomination chips
  // both write text through the formatter and read it back through here, so
  // flooring makes max mean `max − 1`, knocks a chip off the ladder it exists to
  // sit on, and reads a single-unit balance back as zero.
  //
  // Rounding up cannot over-draw: `base <= floor(B * step / RAY)` implies
  // `ceil(base * RAY / step) <= B`, so anything the balance can express still
  // fits inside it, and an entry genuinely above the balance still exceeds it
  // for `validateAmount` to reject. It can deliver up to one unit more than an
  // off-boundary amount asked for, which is the safe direction.
  return (numer + step - 1n) / step;
}

/// The three fields every circuit↔token conversion needs.
///
/// `index` is required, not optional: an absent index silently reports what a
/// note was worth when it was credited rather than now. A plain-custody asset
/// carries `RAY`, the identity, stated once where the asset is known to be plain
/// rather than defaulted at every conversion.
export interface AssetUnits {
  decimals: number;
  scale: bigint;
  /// Pool-managed yield index, RAY-scaled. `RAY` for plain custody.
  index: bigint;
}

/// Circuit units → token base units.
///
/// A unit is worth `scale * index / RAY` base units, not `scale`: the pool's
/// yield index *is* the yield, so a conversion that leaves it out reports what
/// the notes were worth when they were credited rather than what they are worth
/// now. Every figure quoted to the user in a token's own units goes through
/// here, so no display can drift from the one the pool would settle.
///
/// Floors, matching `MASP`'s own conversion.
///
/// A thin adapter over the SDK's `toTokenUnits`, which owns the pool's
/// conversion and its rounding direction. The wrapper exists only to drop the
/// `CircuitAmount` brand, which `circuitAmount()` refuses to mint for a
/// negative; `usdValue` below converts negative balances.
export function toBaseUnits(circuitUnits: bigint, scale: bigint, index: bigint): bigint {
  const neg = circuitUnits < 0n;
  const magnitude = toTokenUnits(circuitAmount(neg ? -circuitUnits : circuitUnits), scale, {
    index,
  });
  return neg ? -magnitude : magnitude;
}

/// Inverse of `parseAmountForAsset`: render an asset quantity in circuit units as
/// a decimal string.
export function formatAmountForAsset(
  circuitUnits: bigint,
  decimals: number,
  scale: bigint,
  index: bigint,
): string {
  return formatDecimal(toBaseUnits(circuitUnits, scale, index), decimals);
}

/// Fractional digits an asset amount is shown with on screen.
///
/// Balances carry up to the token's own `decimals` — 18 for most — and a figure
/// that long is not read, it is skipped over. Five is enough to tell two
/// amounts apart at a glance and short enough to scan a column of them.
///
/// Display only. Anything the app writes back into a field, signs, or sends
/// keeps full precision: see {@link DenominationOption.text}, whose whole
/// contract is that `parseAmountForAsset` maps it back exactly.
export const DISPLAY_FRAC_DIGITS = 5;

/// An asset quantity for display: circuit units → a decimal string capped at
/// {@link DISPLAY_FRAC_DIGITS}.
///
/// Truncates toward zero rather than rounding, so a balance is never shown as
/// larger than it is. Dust below the cap still shows significant digits instead
/// of collapsing to "0" — see `compactFracDigits`; a balance that exists must
/// not read as a balance that does not.
export function formatAmountForDisplay(circuitUnits: bigint, asset: AssetUnits): string {
  return formatDecimalCompact(
    toBaseUnits(circuitUnits, asset.scale, asset.index),
    asset.decimals,
    DISPLAY_FRAC_DIGITS,
  );
}

/// `${formattedAmount} ${symbol}` for a registered asset.
///
/// `symbol` is optional so the placeholder metas the forms fall back to render a
/// bare figure rather than a trailing `undefined`.
export function formatAssetAmount(
  amount: bigint,
  asset: AssetUnits & { symbol?: string | undefined },
): string {
  // Display-capped: every caller is a caption — a balance hint, a ladder
  // notice, a claim-link summary. Nothing reads this back. What *is* read back
  // — the max button's write and a chip's `text` — goes through
  // `formatAmountForAsset` directly and keeps full precision.
  const formatted = formatAmountForDisplay(amount, asset);
  return asset.symbol ? `${formatted} ${asset.symbol}` : formatted;
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
  index: bigint,
): number {
  const base = toBaseUnits(circuitUnits, scale, index);
  if (decimals <= 0) return Number(base) * priceUsd;
  const div = 10n ** BigInt(decimals);
  const neg = base < 0n;
  const abs = neg ? -base : base;
  const tokens = Number(abs / div) + Number(abs % div) / Number(div);
  return (neg ? -tokens : tokens) * priceUsd;
}
