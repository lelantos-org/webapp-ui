import type { RegisteredAsset } from "@/config/chains";
import { baseUnitsUsd } from "@/shared/domain/units";
import type { AssetBalanceView } from "../balances/use-balances";
import { assetUsd, type PriceMap, priceOf } from "../prices/prices";
import type { YieldGains } from "../yield/yield-gains";

export interface PortfolioTotalResult {
  /// Sum over the rows that have a price. Read together with `unpriced`.
  usd: number;
  /// Rows that contributed to `usd`.
  priced: number;
  /// Non-zero rows no price covered. Any means the total is partial and must be flagged.
  unpriced: number;
}

/// Sum the priced rows and count the unpriced ones, ignoring zero balances.
export function portfolioTotal(
  rows: readonly AssetBalanceView[],
  byId: ReadonlyMap<bigint, RegisteredAsset>,
  prices: PriceMap,
): PortfolioTotalResult {
  let usd = 0;
  let priced = 0;
  let unpriced = 0;

  for (const row of rows) {
    const total = row.balance + row.pending;
    if (total <= 0n) continue;

    const meta = byId.get(row.asset);
    const value = meta ? assetUsd(total, meta, prices) : undefined;
    if (value === undefined) {
      unpriced++;
      continue;
    }
    usd += value;
    priced++;
  }

  return { usd, priced, unpriced };
}

export interface EarnedTotal {
  /// Sum of the priced, resolved gains, in USD. Signed.
  usd: number;
  /// Some earning asset was left out, so `usd` is a lower bound.
  partial: boolean;
}

/// The hero's "+$X earned", or `undefined` when nothing could be counted (never "+$0.00").
export function earnedTotal(
  gains: YieldGains,
  byId: ReadonlyMap<bigint, RegisteredAsset>,
  prices: PriceMap,
): EarnedTotal | undefined {
  let usd = 0;
  let counted = 0;
  let partial = false;

  for (const [assetId, gain] of gains) {
    if (gain.unknownNotes > 0) partial = true;
    if (gain.resolvedNotes === 0) continue;
    const meta = byId.get(assetId);
    const price = meta ? priceOf(prices, meta.token) : undefined;
    if (meta === undefined || price === undefined) {
      partial = true;
      continue;
    }
    // Gains are already in base units: price them directly, never convert again.
    usd += baseUnitsUsd(gain.gain, meta.decimals, price);
    counted++;
  }

  return counted === 0 ? undefined : { usd, partial };
}
