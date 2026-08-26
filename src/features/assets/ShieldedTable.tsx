// The shielded balance table, split out of `AssetsCard`.

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
        {/* `/` is the deposit tab: a no-op from the deposit route itself, and a
            navigation from any other. */}
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
/// the balance would remount the element on every change and replay its entrance
/// animation as a tx settled in stages.
///
/// Memoised. `row` identities are stable while the balances query is unchanged,
/// so an unrelated re-render of the card does not re-render the table.
const ShieldedRowView = memo(function ShieldedRowView({
  row,
  label,
  meta,
  price,
}: {
  row: AssetBalanceView;
  label: string;
  meta: RegisteredAsset | undefined;
  /// USD per whole token, or `undefined` when no price is known. Not zero: an
  /// unpriced asset shows no dollar line rather than `$0.00`.
  price: number | undefined;
}) {
  const fmt = (v: bigint) =>
    meta ? formatAmountForAsset(v, meta.decimals, meta.scale) : v.toString();

  // Both directions are rendered. A single branch on `outflow` would hide an
  // incoming amount whenever something was also leaving, so a swap — which has
  // both legs in flight — would report only the debit.
  //
  // One element each rather than one holding both signed figures, so a debit and
  // a credit do not run together as a single expression.
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
          {/* Seeded on the token address where there is one, so two rows sharing
              a symbol still get different marks. */}
          <TokenIcon symbol={label} address={meta?.token} />
          <span className="tok__sym mono">{label}</span>
        </span>
      </td>
      <td className="ta-r">
        <span className="bal">
          {/* On the figure's own line rather than stacked beneath it. A second
              line would change the row's height as each leg appeared and
              settled, shifting the whole table, and a swap's two legs would wrap
              to a third line on a narrow screen. */}
          {settling.length > 0 ? (
            <span className="bal__flow">
              {/* The legs are amounts distinguished by colour and a spinner, so
                  the label is supplied for assistive technology. */}
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
      {/* An unpriced asset gets a dash rather than a blank, so the column keeps
          its shape and the absence of a price is stated. */}
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
