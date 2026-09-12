// Price and yield fixtures for the portfolio's arithmetic.

import { type PriceMap, priceKey } from "@/features/assets/prices";
import type { YieldGain } from "@/features/assets/yield-gains";

/// A price map from `token → USD`.
///
/// Keyed through `priceKey` for the same reason production is: the map is keyed
/// by the normalised address, so a fixture spelling one any other way would be
/// testing a map no lookup can reach.
export function priceMap(entries: Record<string, number>): PriceMap {
  return new Map(
    Object.entries(entries).map(([token, priceUsd]) => [priceKey(token), { priceUsd, priceAt: 0 }]),
  );
}

/// One asset's measured return: nothing earned on a resolved 1e18 basis, unless
/// told otherwise.
export function yieldGain(over: Partial<YieldGain> = {}): YieldGain {
  return { gain: 0n, basis: 10n ** 18n, resolvedNotes: 1, unknownNotes: 0, ...over };
}
