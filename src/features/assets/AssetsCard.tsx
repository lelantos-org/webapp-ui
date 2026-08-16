import { useEffect, useState } from "react";
import { PortfolioActions } from "@/features/assets/PortfolioActions";
import { type RegisteredAsset, useRegisteredAssets } from "@/features/assets/registered-assets";
import { useBalances } from "@/features/assets/use-balances";
import { useSyncProgress } from "@/features/wallet/sync-progress-store";
import { describeError } from "@/shared/lib/errors";
import { formatAmountForAsset } from "@/shared/lib/format";

export function AssetsCard() {
  const shielded = useBalances();
  const assets = useRegisteredAssets();

  // Tick to keep relative time fresh inside `PortfolioActions`.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const labelFor = (id: bigint): string => {
    const a = assets.find((r) => r.id === id);
    return a ? a.symbol : `#${id.toString()}`;
  };

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
        <ShieldedTable
          rows={shielded.data?.balances ?? []}
          labelFor={labelFor}
          metaFor={(id) => assets.find((r) => r.id === id)}
        />
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

function ShieldedTable({
  rows,
  labelFor,
  metaFor,
}: {
  rows: ShieldedRow[];
  labelFor: (id: bigint) => string;
  metaFor: (id: bigint) => RegisteredAsset | undefined;
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
          {rows.map((r) => (
            <ShieldedRowView
              key={r.asset.toString()}
              row={r}
              label={labelFor(r.asset)}
              meta={metaFor(r.asset)}
            />
          ))}
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
function ShieldedRowView({
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
