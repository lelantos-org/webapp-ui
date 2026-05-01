import { useEffect, useState } from "react";
import { type RegisteredAsset, useRegisteredAssets } from "@/features/assets/registered-assets";
import { PortfolioActions } from "@/features/assets/PortfolioActions";
import { useWalletState } from "@/features/wallet/use-wallet-state";
import { describeError } from "@/shared/lib/errors";
import { formatAmountForAsset } from "@/shared/lib/format";

export function AssetsCard() {
  const shielded = useWalletState();
  const assets = useRegisteredAssets();

  // Tick to keep relative time fresh inside `PortfolioActions`.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const labelFor = (id: bigint): string => {
    const a = assets.data?.find((r) => r.id === id);
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
        <PortfolioSkeleton />
      ) : (
        <ShieldedTable
          rows={shielded.data?.balances ?? []}
          labelFor={labelFor}
          metaFor={(id) => assets.data?.find((r) => r.id === id)}
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
          {rows.map((r) => {
            const meta = metaFor(r.asset);
            const fmt = (v: bigint) =>
              meta ? formatAmountForAsset(v, meta.decimals, meta.scale) : v.toString();
            return (
              <tr key={r.asset.toString()}>
                <td className="mono">{labelFor(r.asset)}</td>
                <td className="bal ta-r">
                  <span key={(r.balance + r.pending).toString()} className="bal__main mono accent flash">
                    {fmt(r.balance + r.pending)}
                  </span>
                  {r.outflow > 0n || r.pending > 0n ? (
                    <span className={`bal__settle ${r.outflow > 0n ? "bal__settle--out" : "bal__settle--in"}`}>
                      <span className="bal__spin" aria-hidden />
                      {r.outflow > 0n ? `−${fmt(r.outflow)}` : `+${fmt(r.pending)}`} settling
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="tbl-wrap" aria-busy="true" aria-label="loading portfolio">
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
