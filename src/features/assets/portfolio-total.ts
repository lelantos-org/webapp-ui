// Aggregate USD across the shielded balances.
//
// Kept out of the component so the partial case — the one that decides whether
// a figure is honest — is testable without rendering a table.

import type { RegisteredAsset } from "@/config/chains";
import type { PriceMap } from "@/features/prices";
import { assetUsd } from "@/features/prices";
import type { AssetBalanceView } from "./use-balances";

export interface PortfolioTotalResult {
  /// Sum over the rows that have a price. Meaningless on its own — read it
  /// with `unpriced`.
  usd: number;
  /// Rows that contributed to `usd`.
  priced: number;
  /// Rows holding a non-zero balance that no price covered. A total with any
  /// of these understates the portfolio, and the UI has to say so: silently
  /// reporting the smaller number is worse than reporting none.
  unpriced: number;
}

/// Sum the priced rows and count what was left out.
///
/// A zero balance is ignored on both sides: an asset the wallet does not hold
/// cannot make a total wrong, and counting it as "unpriced" would flag every
/// portfolio on a chain the provider covers only in part.
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
