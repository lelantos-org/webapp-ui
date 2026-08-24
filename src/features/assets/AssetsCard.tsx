import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { PortfolioActions } from "@/features/assets/PortfolioActions";
import { portfolioTotal } from "@/features/assets/portfolio-total";
import { type RegisteredAsset, useRegisteredAssets } from "@/features/assets/registered-assets";
import { type AssetBalanceView, useBalances } from "@/features/assets/use-balances";
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
        <PortfolioTotal rows={shielded.data?.balances ?? EMPTY_ROWS} byId={byId} prices={prices} />
        <PortfolioActions />
      </div>

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

/// Aggregate USD beside the card title.
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

  return (
    <span className="pf-total mono">
      {formatUsd(usd)}
      {unpriced > 0 ? <span className="muted txt-xs"> + {unpriced} unpriced</span> : null}
    </span>
  );
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
      <table className="tbl">
        <thead>
          <tr>
            <th>asset</th>
            <th className="ta-r">balance</th>
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
  const settling = [
    row.outflow > 0n ? `−${fmt(row.outflow)}` : undefined,
    row.pending > 0n ? `+${fmt(row.pending)}` : undefined,
  ].filter((s): s is string => s !== undefined);

  const total = row.balance + row.pending;
  const usd =
    meta && price !== undefined ? usdValue(total, meta.decimals, meta.scale, price) : undefined;

  return (
    <tr>
      <td className="mono">{label}</td>
      <td className="bal ta-r">
        <span className="bal__main mono accent">{fmt(total)}</span>
        {usd !== undefined ? <span className="bal__usd muted">{formatUsd(usd)}</span> : null}
        {settling.length > 0 ? (
          <span
            className={`bal__settle ${row.outflow > 0n ? "bal__settle--out" : "bal__settle--in"}`}
          >
            <span className="bal__spin" aria-hidden />
            {settling.join(" ")} settling
          </span>
        ) : null}
      </td>
    </tr>
  );
});

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
      <table className="tbl">
        <thead>
          <tr>
            <th>asset</th>
            <th className="ta-r">balance</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((i) => (
            <tr key={i}>
              <td>
                <span className="skel-bar" style={{ width: "5ch" }} />
              </td>
              <td className="ta-r">
                <span className="skel-bar" style={{ width: "10ch" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
