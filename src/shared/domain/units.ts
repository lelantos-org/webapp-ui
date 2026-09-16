// Token base units, and what an asset's units are worth.
//
// The pool counts an asset in circuit units; an ERC-20 counts it in base units.
// A unit is worth `scale * index / RAY` base units, where `scale` is fixed per
// asset and `index` is the pool's yield index (`RAY` for plain custody). The
// conversions themselves are the SDK's (`parseAmount`, `toBaseUnits`, …), which
// take the index with the asset, so none of them can leave it out; this module
// names the shapes they are applied to and prices the result.

import { type TokenAmount, toBaseUnits } from "@lelantos-org/sdk";

/// Brand a bigint known, by where it came from, to count token base units: a
/// chain balance read, a sum of pulls.
///
/// Type-level only. The SDK's `tokenAmount` throws on a negative, which on a
/// display path would turn a bad figure into a crash; this names the unit and
/// changes nothing at runtime.
export function asBaseUnits(value: bigint): TokenAmount {
  return value as TokenAmount;
}

/// Zero, in token base units.
export const ZERO_BASE: TokenAmount = asBaseUnits(0n);

/// The three fields every circuit↔token conversion needs. Satisfies the SDK's
/// `AssetUnits`, so a registry row converts through the SDK as it is.
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

/// USD value of `circuitUnits` of an asset priced at `priceUsd` per whole token.
///
/// Balances are held in circuit units, so they convert to base units — through
/// `scale` and the yield index — before `decimals` converts to whole tokens.
/// Omitting that step understates every asset whose `scale > 1`.
export function usdValue(
  circuitUnits: bigint,
  decimals: number,
  scale: bigint,
  priceUsd: number,
  index: bigint,
): number {
  return baseUnitsUsd(toBaseUnits(circuitUnits, { scale, index }), decimals, priceUsd);
}

/// USD value of an amount already in base units: `usdValue` without the
/// circuit-unit conversion.
///
/// For figures that are base units to begin with — a fee row, a public balance.
/// Passing those through `usdValue` would multiply by `scale` a second time.
///
/// The bigint is split into whole and fractional parts before either reaches
/// `Number`. Converting the base-unit value directly would round an 18-decimal
/// balance past `Number.MAX_SAFE_INTEGER`, losing dollars from the integer part
/// for precision on a fraction of a cent.
export function baseUnitsUsd(base: bigint, decimals: number, priceUsd: number): number {
  if (decimals <= 0) return Number(base) * priceUsd;
  const div = 10n ** BigInt(decimals);
  const neg = base < 0n;
  const abs = neg ? -base : base;
  const tokens = Number(abs / div) + Number(abs % div) / Number(div);
  return (neg ? -tokens : tokens) * priceUsd;
}
