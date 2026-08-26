// The portfolio's headline USD figure, split out of `AssetsCard`.

import { useMemo } from "react";
import type { PriceMap } from "@/features/prices";
import { formatUsd } from "@/shared/lib/format";
import { portfolioTotal } from "./portfolio-total";
import type { RegisteredAsset } from "./registered-assets";
import type { AssetBalanceView } from "./use-balances";

/// Aggregate USD, as the card's headline figure.
///
/// Rendered in its own band above the table, since it is the primary figure the
/// card reports.
///
/// Absent entirely until something is priced, so a chain the provider does not
/// cover — including the local anvil stack — renders the card without an empty
/// `$0.00`.
///
/// When a held asset has no price, the figure is marked approximate and the
/// omission is named, rather than presenting an incomplete total as a complete
/// one.
export function PortfolioTotal({
  rows,
  byId,
  prices,
}: {
  rows: AssetBalanceView[];
  byId: ReadonlyMap<bigint, RegisteredAsset>;
  prices: PriceMap;
}) {
  const { usd, priced, unpriced } = useMemo(
    () => portfolioTotal(rows, byId, prices),
    [rows, byId, prices],
  );

  if (priced === 0) return null;

  const [dollars, cents] = splitUsd(formatUsd(usd));

  return (
    <div className="pf-sum">
      <div className="pf-sum__body">
        <span className="pf-sum__label">total value</span>
        <span className="pf-sum__val mono">
          {/* The tilde marks the figure as approximate at a glance; the chip
              below states the same in words. */}
          {unpriced > 0 ? (
            <span className="pf-sum__approx" aria-hidden>
              ≈
            </span>
          ) : null}
          {dollars}
          {cents ? <span className="pf-sum__cents">{cents}</span> : null}
        </span>
      </div>
      {unpriced > 0 ? (
        <span className="pf-sum__partial">
          excludes {unpriced} unpriced asset{unpriced === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );
}

/// Split a rendered USD figure into dollars and cents, so the cents can be set
/// smaller and the magnitude reads first.
///
/// A string with no two-digit decimal tail, such as `formatUsd`'s `<$0.01`, is
/// returned whole rather than cut at an arbitrary dot.
function splitUsd(s: string): [dollars: string, cents: string] {
  const dot = s.lastIndexOf(".");
  if (dot < 0 || s.length - dot !== 3) return [s, ""];
  return [s.slice(0, dot), s.slice(dot)];
}
