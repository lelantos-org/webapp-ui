// Turning a token amount into dollars.
//
// Split from `use-prices` so the arithmetic is testable without a query, and so
// the two conventions it encodes live in one place: prices are keyed by
// lowercased address, and amounts are in circuit units.

import { type AssetUnits, usdValue } from "@/shared/lib/format";
import type { PriceMap } from "./use-prices";

/// The parts of an asset needed to price it. Satisfied by both `RegisteredAsset`
/// and the forms' `AssetMeta`.
export interface PricedAsset extends AssetUnits {
  /// Backing ERC-20 address. Absent on the placeholder metas the forms fall back
  /// to, which yields no price.
  token?: string;
}

/// USD per whole token, or `undefined` when nothing knows.
///
/// The lowercasing lives here and nowhere else. The registry hands out
/// checksummed addresses while the relayer sends lowercase ones, so a lookup
/// omitting it finds nothing, and an unpriced token is indistinguishable from one
/// the provider does not cover.
export function priceOf(prices: PriceMap, token: string | undefined): number | undefined {
  return token ? prices.get(token.toLowerCase())?.priceUsd : undefined;
}

/// Dollar value of `amount` circuit units of `asset`, or `undefined` when the
/// asset has no price. Never `0`, which would read as a priced zero.
export function assetUsd(amount: bigint, asset: PricedAsset, prices: PriceMap): number | undefined {
  const price = priceOf(prices, asset.token);
  return price === undefined
    ? undefined
    : usdValue(amount, asset.decimals, asset.scale, price, asset.index);
}
