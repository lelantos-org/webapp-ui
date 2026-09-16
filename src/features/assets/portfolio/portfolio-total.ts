// Aggregate USD across the shielded balances.
//
// Kept out of the component so the partial case, which decides whether a total
// can be shown at all, is testable without rendering a table.

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
  /// Rows holding a non-zero balance that no price covered. A total with any of
  /// these understates the portfolio, so the UI must report it rather than
  /// present the smaller number as complete.
  unpriced: number;
}

/// Sum the priced rows and count what was left out.
///
/// A zero balance is ignored on both sides: an asset the wallet does not hold
/// cannot affect the total, and counting it as unpriced would flag every
/// portfolio on a chain the price provider covers only in part.
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
  /// Something that earns was left out of `usd` — notes with no resolvable
  /// basis, or an earning asset with no price — so the figure is a lower bound
  /// on what the counted notes say, and is marked as one.
  partial: boolean;
}

/// The hero's "+$X earned": what the notes held now have accrued, in dollars.
///
/// `undefined` when nothing contributes — no earning asset, no resolved basis,
/// or no price for any of them. The hero then omits the clause rather than
/// printing "+$0.00 earned", which would claim a measurement.
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
    // `YieldGain` keeps a gain in the token's base units, already through
    // `scale` and `index`, so it is priced as base units rather than converted a
    // second time. Signed: a venue loss prices negative.
    usd += baseUnitsUsd(gain.gain, meta.decimals, price);
    counted++;
  }

  return counted === 0 ? undefined : { usd, partial };
}
