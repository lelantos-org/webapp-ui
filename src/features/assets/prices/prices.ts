import { z } from "zod";
import { type AssetLabel, type AssetUnits, usdValue } from "@/shared/domain/units";

const priceRow = z.object({
  chainId: z.number(),
  token: z.string(),
  priceUsd: z.number(),
  priceAt: z.number(),
});

/// The `/v1/prices` response body.
export const pricesResponse = z.object({ prices: z.array(priceRow) });

export type PricesResponse = z.infer<typeof pricesResponse>;

export type PriceRow = z.infer<typeof priceRow>;

/// One token's quote; `priceAt` is the provider's timestamp, not the fetch time.
export interface TokenPrice {
  priceUsd: number;
  priceAt: number;
}

declare const priceKeyBrand: unique symbol;

/// A token address normalised for lookup. Build it only with `priceKey`.
export type PriceKey = string & { readonly [priceKeyBrand]: true };

/// Normalise a token address into a `PriceKey`.
export function priceKey(token: string): PriceKey {
  return token.toLowerCase() as PriceKey;
}

/// Prices for the active chain. A token absent from the map is unpriced, not `$0`.
export type PriceMap = ReadonlyMap<PriceKey, TokenPrice>;

/// Narrow the all-chains body to one chain, keyed by `priceKey`.
export function toPriceMap(rows: readonly PriceRow[], chainId: bigint): PriceMap {
  const m = new Map<PriceKey, TokenPrice>();
  for (const r of rows) {
    if (BigInt(r.chainId) !== chainId) continue;
    m.set(priceKey(r.token), { priceUsd: r.priceUsd, priceAt: r.priceAt });
  }
  return m;
}

/// USD per whole token, or `undefined` when unpriced.
export function priceOf(prices: PriceMap, token: string | undefined): number | undefined {
  return token ? prices.get(priceKey(token))?.priceUsd : undefined;
}

/// Dollar value of `amount` circuit units of `asset`, or `undefined` (never `0`) when unpriced.
export function assetUsd(
  amount: bigint,
  asset: AssetUnits & Pick<AssetLabel, "token">,
  prices: PriceMap,
): number | undefined {
  const price = priceOf(prices, asset.token);
  return price === undefined
    ? undefined
    : usdValue(amount, asset.decimals, asset.scale, price, asset.index);
}
