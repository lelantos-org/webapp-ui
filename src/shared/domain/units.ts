import { type TokenAmount, toBaseUnits } from "@lelantos-org/sdk";

/// Brand a bigint as token base units. Type-level only: no runtime check.
export function asBaseUnits(value: bigint): TokenAmount {
  return value as TokenAmount;
}

/// Zero, in token base units.
export const ZERO_BASE: TokenAmount = asBaseUnits(0n);

/// The fields every circuit/token conversion needs; `index` is required so it is never stale.
export interface AssetUnits {
  decimals: number;
  scale: bigint;
  /// Pool-managed yield index, RAY-scaled. `RAY` for plain custody.
  index: bigint;
}

/// What names an asset on screen and prices it.
export interface AssetLabel {
  symbol: string;
  /// Backing ERC-20 address for USD pricing; absent means no dollar figure.
  token?: string | undefined;
}

/// USD value of `circuitUnits` of an asset priced at `priceUsd` per whole token.
export function usdValue(
  circuitUnits: bigint,
  decimals: number,
  scale: bigint,
  priceUsd: number,
  index: bigint,
): number {
  return baseUnitsUsd(toBaseUnits(circuitUnits, { scale, index }), decimals, priceUsd);
}

/// USD value of an amount already in base units; splits the bigint first to keep precision.
export function baseUnitsUsd(base: bigint, decimals: number, priceUsd: number): number {
  if (decimals <= 0) return Number(base) * priceUsd;
  const div = 10n ** BigInt(decimals);
  const neg = base < 0n;
  const abs = neg ? -base : base;
  const tokens = Number(abs / div) + Number(abs % div) / Number(div);
  return (neg ? -tokens : tokens) * priceUsd;
}
