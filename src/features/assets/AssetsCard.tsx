import { useMemo } from "react";
import { usePrices } from "@/features/prices";
import { useSyncProgress } from "@/features/wallet";
import { describeError } from "@/shared/lib/errors";
import { PortfolioActions } from "./PortfolioActions";
import { PortfolioTotal } from "./PortfolioTotal";
import { type RegisteredAsset, useRegisteredAssets } from "./registered-assets";
import { ShieldedTable } from "./ShieldedTable";
import { type AssetBalanceView, useBalances } from "./use-balances";

export function AssetsCard() {
  const shielded = useBalances();
  const assets = useRegisteredAssets();
  const prices = usePrices();

  // A single index rather than a linear `assets.find` per row per render. It also
  // gives the rows stable prop identities, which is what makes memoising them
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

/// Counts from the in-flight sync, so the first load is not a bare spinner. A
/// cold sync scans the whole note feed and can run for minutes, and a moving
/// count is what distinguishes it from a hang.
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
