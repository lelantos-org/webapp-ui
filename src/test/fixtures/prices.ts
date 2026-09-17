import { type PriceMap, priceKey } from "@/features/assets/prices/prices";
import type { YieldGain } from "@/features/assets/yield/yield-gains";

/// A price map from `token → USD`, keyed through `priceKey` as production is.
export function priceMap(entries: Record<string, number>): PriceMap {
  return new Map(
    Object.entries(entries).map(([token, priceUsd]) => [priceKey(token), { priceUsd, priceAt: 0 }]),
  );
}

/// One asset's measured return: nothing earned on a 1e18 basis, with overrides.
export function yieldGain(over: Partial<YieldGain> = {}): YieldGain {
  return { gain: 0n, basis: 10n ** 18n, resolvedNotes: 1, unknownNotes: 0, ...over };
}
