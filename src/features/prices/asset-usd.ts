// Turning a token amount into dollars.
//
// Split from `use-prices` so the arithmetic is testable without a query, and
// so the two conventions it encodes live in exactly one place: prices are keyed
// by lowercased address, and an amount is in circuit units.

import type { PriceMap } from "@/features/prices/use-prices";
import { usdValue } from "@/shared/lib/format";

/// The parts of an asset needed to price it. Satisfied by both `RegisteredAsset`
/// and the forms' `AssetMeta`.
export interface PricedAsset {
  decimals: number;
  scale: bigint;
  /// Backing ERC-20 address. Absent on the placeholder metas the forms fall
  /// back to, which is simply "no price".
  token?: string;
}

/// USD per whole token, or `undefined` when nothing knows.
///
/// The lowercasing lives here and nowhere else. The registry hands out
/// checksummed addresses while the relayer sends lowercase ones, so a lookup
/// that forgets it silently finds nothing — and a silently unpriced token looks
/// exactly like one the provider does not cover.
export function priceOf(prices: PriceMap, token: string | undefined): number | undefined {
  return token ? prices.get(token.toLowerCase())?.priceUsd : undefined;
}

/// Dollar value of `amount` circuit units of `asset`, or `undefined` when the
/// asset has no price. Never `0` standing in for "unknown".
export function assetUsd(amount: bigint, asset: PricedAsset, prices: PriceMap): number | undefined {
  const price = priceOf(prices, asset.token);
  return price === undefined ? undefined : usdValue(amount, asset.decimals, asset.scale, price);
}
