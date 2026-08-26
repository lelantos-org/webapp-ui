// Split out of `AssetsCard`: it was one 328-line file holding five
// components, with this one buried in the middle.

import { useMemo } from "react";
import type { PriceMap } from "@/features/prices";
import { formatUsd } from "@/shared/lib/format";
import { portfolioTotal } from "./portfolio-total";
import type { RegisteredAsset } from "./registered-assets";
import type { AssetBalanceView } from "./use-balances";

/// Aggregate USD, as the card's headline figure.
///
/// Its own band above the table rather than a 13px span wedged into the header
/// row: this is the one number the card exists to report, and it was being set
/// smaller than the per-row balances underneath it.
///
/// Absent entirely until something is priced, so a chain the provider does not
/// cover — the local anvil stack included — shows the card exactly as before
/// rather than an empty `$0.00`.
///
/// When some held asset has no price the figure is marked approximate and the
/// omission is named. A total that silently leaves out an asset is a wrong
/// number presented as a right one.
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
          {/* The tilde is the whole warning at a glance; the chip beside it
              carries the same fact in words for anyone reading, or listening,
              rather than scanning. */}
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

/// Split a rendered USD figure into its dollars and its cents, so the cents can
/// be set smaller and the eye lands on the magnitude.
///
/// A string with no two-digit decimal tail — `formatUsd`'s `<$0.01` — comes
/// back whole rather than being cut at an arbitrary dot.
function splitUsd(s: string): [dollars: string, cents: string] {
  const dot = s.lastIndexOf(".");
  if (dot < 0 || s.length - dot !== 3) return [s, ""];
  return [s.slice(0, dot), s.slice(dot)];
}
