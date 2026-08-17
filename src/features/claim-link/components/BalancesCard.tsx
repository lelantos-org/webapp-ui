import { findAsset, type RegisteredAsset } from "@/features/assets/registered-assets";
import type { EphemeralBalance } from "@/features/claim-link/claimLink";
import { formatAmount, formatAmountForAsset } from "@/shared/lib/format";
import { AddressBadge } from "@/shared/ui/AddressBadge";

export interface BalancesCardProps {
  balances: EphemeralBalance[];
  assets?: readonly RegisteredAsset[];
  destinationAddress?: string;
  busy: boolean;
  busyAsset?: bigint;
  /// Why claiming is unavailable right now — currently a wallet on the wrong
  /// chain. Present, every claim button is disabled and says so, so the
  /// reason travels with the button instead of only living in a card above it.
  blockedReason?: string;
  onClaim(asset: bigint): void;
}

export function BalancesCard({
  balances,
  assets,
  destinationAddress,
  busy,
  busyAsset,
  blockedReason,
  onClaim,
}: BalancesCardProps) {
  if (balances.length === 0) {
    return (
      <div className="card">
        <div className="card__hdr">
          <h3 className="card__t">no notes found</h3>
        </div>
        <div className="empty">
          <div className="empty__t">nothing to claim at this link</div>
          <div className="muted txt-sm">
            note may already have been swept, or sender's tx hasn't landed yet.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card claim-found">
      <div className="card__hdr">
        <h3 className="card__t">claimable</h3>
        <span className="muted txt-xs">
          {balances.length} asset{balances.length === 1 ? "" : "s"}
        </span>
      </div>

      {destinationAddress ? (
        <div className="claim-dest">
          <span className="muted txt-xs">destination</span>
          <AddressBadge value={destinationAddress} />
        </div>
      ) : null}

      <div className="claim-rows">
        {balances.map((b) => {
          const a = findAsset(assets, b.asset);
          const symbol = a?.symbol ?? `#${b.asset.toString()}`;
          const formatted = a
            ? formatAmountForAsset(b.amount, a.decimals, a.scale)
            : formatAmount(b.amount);
          const isBusy = busy && busyAsset === b.asset;
          return (
            <div key={b.asset.toString()} className="claim-row">
              <div className="claim-row__glyph" aria-hidden>
                {symbol.slice(0, 3).toUpperCase()}
              </div>
              <div className="claim-row__main">
                <div className="claim-row__sym">{symbol}</div>
                <div className="claim-row__sub muted txt-xs">
                  {b.notes} note{b.notes === 1 ? "" : "s"}
                </div>
              </div>
              <div className="claim-row__amt">
                <div className="claim-row__num mono accent">{formatted}</div>
                <div className="claim-row__unit muted txt-xs">{symbol}</div>
              </div>
              <button
                type="button"
                className="btn btn--xl claim-row__cta"
                disabled={busy || blockedReason !== undefined}
                title={blockedReason}
                onClick={() => onClaim(b.asset)}
              >
                {isBusy ? (
                  <>
                    <span className="spinner" aria-hidden /> claiming…
                  </>
                ) : (
                  (blockedReason ?? "claim")
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
