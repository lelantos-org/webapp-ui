import { memo, useMemo } from "react";
import { PortfolioActions } from "@/features/assets/PortfolioActions";
import { type RegisteredAsset, useRegisteredAssets } from "@/features/assets/registered-assets";
import { useBalances } from "@/features/assets/use-balances";
import { useSyncProgress } from "@/features/wallet/sync-progress-store";
import { describeError } from "@/shared/lib/errors";
import { formatAmountForAsset } from "@/shared/lib/format";

export function AssetsCard() {
  const shielded = useBalances();
  const assets = useRegisteredAssets();

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

      {shielded.isLoading && !shielded.data ? (
        <>
          <PortfolioSkeleton />
          <SyncProgressLine />
        </>
      ) : (
        <ShieldedTable rows={shielded.data?.balances ?? EMPTY_ROWS} byId={byId} />
      )}

      {err ? <div className="err mt-3">{describeError(err)}</div> : null}
    </div>
  );
}

interface ShieldedRow {
  asset: bigint;
  balance: bigint;
  notes: number;
  pending: bigint;
  outflow: bigint;
}

/// Stable identity for the no-data case; see `NO_ASSETS`.
const EMPTY_ROWS: ShieldedRow[] = [];

function ShieldedTable({
  rows,
  byId,
}: {
  rows: ShieldedRow[];
  byId: ReadonlyMap<bigint, RegisteredAsset>;
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
}: {
  row: ShieldedRow;
  label: string;
  meta: RegisteredAsset | undefined;
}) {
  const settling = row.outflow > 0n || row.pending > 0n;
  const fmt = (v: bigint) =>
    meta ? formatAmountForAsset(v, meta.decimals, meta.scale) : v.toString();

  return (
    <tr>
      <td className="mono">{label}</td>
      <td className="bal ta-r">
        <span className="bal__main mono accent">{fmt(row.balance + row.pending)}</span>
        {settling ? (
          <span
            className={`bal__settle ${row.outflow > 0n ? "bal__settle--out" : "bal__settle--in"}`}
          >
            <span className="bal__spin" aria-hidden />
            {row.outflow > 0n ? `−${fmt(row.outflow)}` : `+${fmt(row.pending)}`} settling
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
