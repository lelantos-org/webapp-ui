// Prices as the app looks them up: the wire body, narrowed to one chain and keyed
// by a normalised token address, and a token amount turned into dollars.
//
// Pure, so the narrowing, the key normalisation and the arithmetic are testable
// without the query that fetches the body (`use-prices.ts`). Prices are keyed by
// lowercased address, and amounts are in circuit units.

import { z } from "zod";
import { type AssetLabel, type AssetUnits, usdValue } from "@/shared/domain/units";

const priceRow = z.object({
  chainId: z.number(),
  token: z.string(),
  priceUsd: z.number(),
  priceAt: z.number(),
});

/// The `/v1/prices` body. `usePrices` parses with it.
export const pricesResponse = z.object({ prices: z.array(priceRow) });

export type PricesResponse = z.infer<typeof pricesResponse>;

export type PriceRow = z.infer<typeof priceRow>;

/// One token's quote. `priceAt` is the provider's timestamp rather than the fetch
/// time, so a caller can age it.
export interface TokenPrice {
  priceUsd: number;
  priceAt: number;
}

declare const priceKeyBrand: unique symbol;

/// A token address normalised for lookup.
///
/// Branded rather than a bare `string` because the normalisation is load-bearing
/// and invisible: the catalog publishes checksummed addresses, so a `get` with
/// the raw spelling returns `undefined`, which a caller cannot tell from a token
/// the provider does not price. The brand makes that mistake a compile error
/// instead of a silently missing dollar figure — the only way into the map is
/// [`priceKey`].
export type PriceKey = string & { readonly [priceKeyBrand]: true };

/// The one place an address becomes a lookup key. Both the map builder and the
/// reader go through it, so they cannot normalise differently.
export function priceKey(token: string): PriceKey {
  return token.toLowerCase() as PriceKey;
}

/// Prices for the active chain, keyed by [`PriceKey`].
///
/// A token absent from the map has no known price: a local test token, or any
/// token on a chain the provider does not cover. That is distinct from zero, so
/// a caller must render nothing rather than `$0.00`.
export type PriceMap = ReadonlyMap<PriceKey, TokenPrice>;

/// Narrow the all-chains body to one chain, keyed for lookup.
///
/// The body covers every chain the deployment serves, and a token address is
/// meaningful only with its chain: the same address denotes a different asset
/// elsewhere, and two chains may list the same one. Dropping the other chains'
/// rows keeps a wallet from pricing a balance against another network.
///
/// Keys go through [`priceKey`], so a caller reading with it finds a row however
/// either side spelled the address.
export function toPriceMap(rows: readonly PriceRow[], chainId: bigint): PriceMap {
  const m = new Map<PriceKey, TokenPrice>();
  for (const r of rows) {
    if (BigInt(r.chainId) !== chainId) continue;
    m.set(priceKey(r.token), { priceUsd: r.priceUsd, priceAt: r.priceAt });
  }
  return m;
}

/// USD per whole token, or `undefined` when nothing knows.
///
/// Normalisation goes through `priceKey`, which is the only way to build the
/// key the map is keyed by. The catalog hands out checksummed addresses, so a
/// lookup that skipped it would find nothing and leave an unpriced token
/// indistinguishable from one the provider does not cover.
export function priceOf(prices: PriceMap, token: string | undefined): number | undefined {
  return token ? prices.get(priceKey(token))?.priceUsd : undefined;
}

/// Dollar value of `amount` circuit units of `asset`, or `undefined` when the
/// asset has no price. Never `0`, which would read as a priced zero.
///
/// `asset` is anything with units and a token: a `RegisteredAsset` or a form's
/// `AssetMeta`. `token` is absent on the placeholder metas the forms fall back to,
/// which yields no price.
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
