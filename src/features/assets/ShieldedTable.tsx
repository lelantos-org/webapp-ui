// Split out of `AssetsCard`: it was one 328-line file holding five
// components, with this one buried in the middle.

import { memo } from "react";
import { Link } from "react-router-dom";
import { TokenIcon } from "@/features/icons";
import { type PriceMap, priceOf } from "@/features/prices";
import { formatAmountForAsset, formatUsd, usdValue } from "@/shared/lib/format";
import type { RegisteredAsset } from "./registered-assets";
import type { AssetBalanceView } from "./use-balances";

export function ShieldedTable({
  rows,
  byId,
  prices,
}: {
  rows: AssetBalanceView[];
  byId: ReadonlyMap<bigint, RegisteredAsset>;
  prices: PriceMap;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon" aria-hidden>
          ⌬
        </div>
        <div className="empty__title">no shielded notes yet</div>
        <p className="empty__sub">
          deposit to mint your first shielded note. balances stay private end-to-end.
        </p>
        {/* The copy already names the one thing to do; this is it. `/` is the
            deposit tab, which is a no-op click from the deposit route itself
            and a real one from any other. */}
        <Link to="/" className="btn">
          deposit
        </Link>
      </div>
    );
  }
  return (
    <div className="tbl-wrap">
      <table className="tbl tbl--pf">
        <thead>
          <tr>
            <th>asset</th>
            <th className="ta-r">balance</th>
            <th className="ta-r">value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const meta = byId.get(r.asset);
            return (
              <ShieldedRowView
                key={r.asset.toString()}
                row={r}
                label={meta ? meta.symbol : `#${r.asset.toString()}`}
                meta={meta}
                price={priceOf(prices, meta?.token)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/// One row per asset.
///
/// The figure is updated in place rather than keyed on its own value: keying on
/// the balance remounted the element on every change, which replayed its
/// entrance animation each time a tx settled in stages.
///
/// Memoized: `row` identities are stable while the balances query is
/// unchanged, so a re-render of the card for an unrelated reason does not
/// re-render the table.
const ShieldedRowView = memo(function ShieldedRowView({
  row,
  label,
  meta,
  price,
}: {
  row: AssetBalanceView;
  label: string;
  meta: RegisteredAsset | undefined;
  /// USD per whole token, or `undefined` when nothing knows. Not zero — an
  /// unpriced asset shows no dollar line at all rather than `$0.00`.
  price: number | undefined;
}) {
  const fmt = (v: bigint) =>
    meta ? formatAmountForAsset(v, meta.decimals, meta.scale) : v.toString();

  // Both directions, not one or the other. A single ternary on `outflow`
  // hid an incoming amount whenever something was also on its way out, so a
  // swap — which has both legs in flight at once — reported only the debit.
  //
  // One element each, rather than one holding both signed figures: a debit and
  // a credit are two facts, and running them together — `−1 +2` — read as a
  // single arithmetic expression.
  const settling: SettleLeg[] = [
    row.outflow > 0n ? { dir: "out" as const, text: `−${fmt(row.outflow)}` } : undefined,
    row.pending > 0n ? { dir: "in" as const, text: `+${fmt(row.pending)}` } : undefined,
  ].filter((c): c is SettleLeg => c !== undefined);

  const total = row.balance + row.pending;
  const usd =
    meta && price !== undefined ? usdValue(total, meta.decimals, meta.scale, price) : undefined;

  return (
    <tr>
      <td>
        <span className="tok">
          {/* Seeded on the token address where there is one, so two rows that
              share a symbol still get different marks. */}
          <TokenIcon symbol={label} address={meta?.token} />
          <span className="tok__sym mono">{label}</span>
        </span>
      </td>
      <td className="ta-r">
        <span className="bal">
          {/* Ahead of the figure on its own line, not stacked beneath it. As
              chips this was a second line in the cell, so every leg that
              appeared and every one that settled changed the row's height and
              nudged the whole table — and a swap's two chips wrapped to a
              third line on a narrow screen. The legs are quiet type on the
              figure's line now, so the row is one line tall throughout. */}
          {settling.length > 0 ? (
            <span className="bal__flow">
              {/* The legs are amounts with a colour and a spinner; the word
                  that makes them mean something is only in the styling. */}
              <span className="sr-only">settling</span>
              <span className="bal__spin" aria-hidden />
              {settling.map((c) => (
                <span key={c.dir} className={`bal__delta bal__delta--${c.dir}`}>
                  {c.text}
                </span>
              ))}
            </span>
          ) : null}
          <span className="bal__main mono">{fmt(total)}</span>
        </span>
      </td>
      {/* An unpriced asset gets a dash, not a blank: the column stays a column,
          and "no price known" is said rather than left to be inferred. */}
      <td className="ta-r">
        {usd !== undefined ? (
          <span className="bal__usd mono">{formatUsd(usd)}</span>
        ) : (
          <span className="bal__usd bal__usd--none" title="no price for this asset">
            —
          </span>
        )}
      </td>
    </tr>
  );
});

/// One in-flight leg of a row's balance.
interface SettleLeg {
  dir: "in" | "out";
  text: string;
}
