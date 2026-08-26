import { findAsset, type RegisteredAsset } from "@/features/assets";
import { TokenIcon } from "@/features/icons";
import { formatAmount, formatAmountForAsset } from "@/shared/lib/format";
import { AddressBadge } from "@/shared/ui/AddressBadge";
import type { EphemeralBalance } from "../ephemeral-wallet";

export interface BalancesCardProps {
  balances: EphemeralBalance[];
  assets?: readonly RegisteredAsset[];
  destinationAddress?: string;
  busy: boolean;
  busyAsset?: bigint;
  /// Claiming is unavailable for a reason stated elsewhere on the page — a
  /// wallet on the wrong chain. The buttons go inert without restating it.
  claimDisabled?: boolean;
  onClaim(asset: bigint): void;
}

export function BalancesCard({
  balances,
  assets,
  destinationAddress,
  busy,
  busyAsset,
  claimDisabled = false,
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
              <TokenIcon
                symbol={symbol}
                address={a?.token}
                size="lg"
                className="claim-row__glyph"
              />
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
                disabled={busy || claimDisabled}
                onClick={() => onClaim(b.asset)}
              >
                {isBusy ? (
                  <>
                    <span className="spinner" aria-hidden /> claiming…
                  </>
                ) : (
                  "claim"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
