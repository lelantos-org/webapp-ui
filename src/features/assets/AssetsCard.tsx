import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { PortfolioActions } from "@/features/assets/PortfolioActions";
import { portfolioTotal } from "@/features/assets/portfolio-total";
import { type RegisteredAsset, useRegisteredAssets } from "@/features/assets/registered-assets";
import { type AssetBalanceView, useBalances } from "@/features/assets/use-balances";
import { TokenIcon } from "@/features/icons/TokenIcon";
import { priceOf } from "@/features/prices/asset-usd";
import { type PriceMap, usePrices } from "@/features/prices/use-prices";
import { useSyncProgress } from "@/features/wallet/sync-progress-store";
import { describeError } from "@/shared/lib/errors";
import { formatAmountForAsset, formatUsd, usdValue } from "@/shared/lib/format";

export function AssetsCard() {
  const shielded = useBalances();
  const assets = useRegisteredAssets();
  const prices = usePrices();

  // Single index, replacing a linear `assets.find` per row per render. Also
  // gives the rows stable prop identities, which is what makes memoizing them
  // effective.
  const byId = useMemo(() => {
    const m = new Map<bigint, RegisteredAsset>();
    for (const a of assets) m.set(a.id, a);
    return m;
  }, [assets]);

  const err = shielded.error;

  return (
    <div className="card">
      <div className="card__hdr">
        <h3 className="card__t">Portfolio </h3>
        <PortfolioActions />
      </div>

      <PortfolioTotal rows={shielded.data?.balances ?? EMPTY_ROWS} byId={byId} prices={prices} />

      {shielded.isLoading && !shielded.data ? (
        <PortfolioSkeleton />
      ) : (
        <ShieldedTable rows={shielded.data?.balances ?? EMPTY_ROWS} byId={byId} prices={prices} />
      )}

      {/* Not only under the first-load skeleton. A "hard refresh" wipes the
          note store and rescans the whole feed — minutes of work, previously
          reported as the word "syncing…" in 11px muted type. The line gates
          itself on there being counts to show, so it is absent the rest of the
          time. */}
      <SyncProgressLine />

      {err ? <div className="err mt-3">{describeError(err)}</div> : null}
    </div>
  );
}

/// Stable identity for the no-data case; see `NO_ASSETS`.
const EMPTY_ROWS: AssetBalanceView[] = [];

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
function PortfolioTotal({
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

function ShieldedTable({
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

/// Counts from the in-flight sync, so the first load is not a bare spinner.
/// A cold sync scans the whole note feed and can run for minutes; without a
/// number moving there is nothing to distinguish it from a hang.
function SyncProgressLine() {
  const { active, scanned, hits } = useSyncProgress();
  if (!active || scanned === 0) return null;
  return (
    <div className="muted mt-2" aria-live="polite">
      scanned {scanned.toLocaleString()} notes
      {hits > 0 ? `, found ${hits.toLocaleString()}` : ""}…
    </div>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="tbl-wrap" role="status" aria-busy="true" aria-label="loading portfolio">
      <table className="tbl tbl--pf">
        <thead>
          <tr>
            <th>asset</th>
            <th className="ta-r">balance</th>
            <th className="ta-r">value</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((i) => (
            <tr key={i}>
              <td>
                <span className="tok">
                  <span className="tok__mark tok__mark--skel" aria-hidden />
                  <span className="skel-bar" style={{ width: "5ch" }} />
                </span>
              </td>
              <td className="ta-r">
                <span className="skel-bar" style={{ width: "10ch" }} />
              </td>
              <td className="ta-r">
                <span className="skel-bar" style={{ width: "6ch" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
