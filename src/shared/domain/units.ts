// Circuit units, token base units, and the conversions between them.
//
// The pool counts an asset in circuit units; an ERC-20 counts it in base units.
// A unit is worth `scale * index / RAY` base units, where `scale` is fixed per
// asset and `index` is the pool's yield index (`RAY` for plain custody). Every
// conversion the app performs goes through this module, so none of them can
// leave the index out.

import {
  type CircuitAmount,
  circuitAmount,
  PUBLIC_IN_MAX,
  RAY,
  type TokenAmount,
  toTokenUnits,
} from "@lelantos-org/sdk/core";
import { parseDecimal } from "@/shared/lib/format/number";

/// MASP encodes `publicIn` and `publicOut` as `uint48` on-chain in circuit units
/// (`MASP.sol :: PublicInTooLarge` checks the circuit-units value, not base
/// units). Amounts above this cap must be rejected before submission; on-chain
/// they fail as an opaque `execution reverted` after gas is paid.
///
/// Re-exported from the SDK, which tracks the contract bound.
export { PUBLIC_IN_MAX };

/// Brand a bigint known, by where it came from, to count circuit units: a sum
/// of note values, a stored record's amount, arithmetic on branded amounts.
///
/// Type-level only. The SDK's `circuitAmount` throws on a negative, which on a
/// display path would turn a bad figure into a crash; this names the unit and
/// changes nothing at runtime. Every call is a boundary where an unbranded value
/// enters the typed world, so each should say why the value is in circuit units.
export function asCircuitUnits(value: bigint): CircuitAmount {
  return value as CircuitAmount;
}

/// `asCircuitUnits` for token base units.
export function asBaseUnits(value: bigint): TokenAmount {
  return value as TokenAmount;
}

/// Zero, in token base units.
export const ZERO_BASE: TokenAmount = asBaseUnits(0n);

export function exceedsPublicInLimit(circuitUnits: bigint): boolean {
  return circuitUnits > PUBLIC_IN_MAX;
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

/// What names an asset on screen and prices it: the half of an asset's shape
/// that is not arithmetic.
export interface AssetLabel {
  symbol: string;
  /// Backing ERC-20 address, for pricing in USD. Optional: a placeholder asset
  /// names no token, and an unpriced asset renders no dollar figure rather than
  /// a zero.
  token?: string | undefined;
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
): CircuitAmount {
  const base = asCircuitUnits(parseDecimal(input, decimals));
  // The smallest representable amount is one circuit unit, worth
  // `scale * index / RAY` base units — not `scale`. Checking against `scale`
  // alone would refuse amounts a yield asset represents perfectly well.
  const step = scale * index;
  const numer = base * RAY;
  if (step <= RAY) return base;
  if (numer % step === 0n) return asCircuitUnits(numer / step);

  // Off a unit boundary. For a plain asset that is a real mistake and always
  // has been: `scale` is fixed, so anything finer was never representable and
  // silently truncating it would short the user without saying so.
  //
  // Under a moving index it is not a mistake but a fact of the arithmetic. A
  // unit is worth a non-round number of base units, so most unit counts have no
  // exact decimal at the token's `decimals` — including the one
  // `formatAmountForAsset` writes into the field for the "max" button. Throwing
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
  return asCircuitUnits((numer + step - 1n) / step);
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
/// conversion and its rounding direction. The wrapper exists to take an
/// unbranded amount — `circuitAmount()` refuses to mint a `CircuitAmount` for a
/// negative, and display callers pass signed figures — and hands back a branded
/// `TokenAmount`, so a base-unit parameter downstream (`validateDepositAmount`,
/// `depositMaxAmount`) accepts it and rejects an unconverted circuit amount.
export function toBaseUnits(circuitUnits: bigint, scale: bigint, index: bigint): TokenAmount {
  const neg = circuitUnits < 0n;
  const magnitude = toTokenUnits(circuitAmount(neg ? -circuitUnits : circuitUnits), scale, {
    index,
  });
  return asBaseUnits(neg ? -magnitude : magnitude);
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
  return baseUnitsUsd(toBaseUnits(circuitUnits, scale, index), decimals, priceUsd);
}

/// USD value of an amount already in base units: `usdValue` without the
/// circuit-unit conversion.
///
/// For figures that are base units to begin with — a fee row, a public balance.
/// Passing those through `usdValue` would multiply by `scale` a second time.
export function baseUnitsUsd(base: bigint, decimals: number, priceUsd: number): number {
  if (decimals <= 0) return Number(base) * priceUsd;
  const div = 10n ** BigInt(decimals);
  const neg = base < 0n;
  const abs = neg ? -base : base;
  const tokens = Number(abs / div) + Number(abs % div) / Number(div);
  return (neg ? -tokens : tokens) * priceUsd;
}
