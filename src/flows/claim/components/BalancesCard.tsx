import type { RegisteredAsset } from "@/config/chains";
import { assetUsd, findAsset, usePrices } from "@/features/assets";
import { useActiveChainOrUndefined } from "@/features/chain";
import type { EphemeralBalance } from "@/features/claim-links";
import { formatAmountForAsset } from "@/shared/lib/format/asset";
import { formatUsd } from "@/shared/lib/format/money";
import { formatAmount } from "@/shared/lib/format/number";
import { TokenIcon } from "@/shared/ui/icons/TokenIcon";
import "./claim-cards.css";

export interface BalancesCardProps {
  balances: EphemeralBalance[];
  /// The link chain's tokens, which label the balances.
  assets?: readonly RegisteredAsset[];
  /// The chain the link names, for pricing against it.
  linkChainId: bigint | undefined;
  destinationAddress?: string | undefined;
  busy: boolean;
  busyAsset?: bigint | undefined;
  /// Claiming is unavailable for a reason stated elsewhere on the page — a
  /// wallet on the wrong chain. The buttons go inert without restating it.
  claimDisabled?: boolean;
  onClaim(asset: bigint): void;
}

/// "≈ $75.00" for one claimable balance.
///
/// Its own component because `usePrices` reads the active chain and throws
/// without one: it is mounted only while the wallet sits on the link's chain,
/// which is also the only chain whose prices describe these notes. A wallet
/// switching away unmounts it in the same render rather than pricing the link
/// against another network.
function Usd({ amount, asset }: { amount: bigint; asset: RegisteredAsset }) {
  const usd = assetUsd(amount, asset, usePrices());
  return usd === undefined ? null : <span className="claim-asset__usd">≈ {formatUsd(usd)}</span>;
}

export function BalancesCard({
  balances,
  assets,
  linkChainId,
  destinationAddress,
  busy,
  busyAsset,
  claimDisabled = false,
  onClaim,
}: BalancesCardProps) {
  const active = useActiveChainOrUndefined();
  const priced = linkChainId !== undefined && active?.chainId === linkChainId;

  if (balances.length === 0) {
    return (
      <section className="surface surface--card claim-card">
        <div className="claim-card__head">
          <h2 className="claim-card__t">Nothing to claim at this link</h2>
          <p className="claim-card__sub">
            It may already have been claimed, or the sender's transfer hasn't landed yet. If they
            only just sent it, try the link again in a minute.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="surface surface--card claim-card">
      <div className="claim-card__title-row">
        <h2 className="claim-card__t">Waiting for you</h2>
        <span className="claim-card__meta">
          {balances.length} asset{balances.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="claim-assets">
        {balances.map((b) => {
          const a = findAsset(assets, b.asset);
          const symbol = a?.symbol ?? `#${b.asset.toString()}`;
          const formatted = a ? formatAmountForAsset(b.amount, a) : formatAmount(b.amount);
          const isBusy = busy && busyAsset === b.asset;
          return (
            <li key={b.asset.toString()} className="claim-asset">
              <TokenIcon
                symbol={symbol}
                address={a?.token}
                size="lg"
                className="claim-asset__mark"
              />
              <div className="claim-asset__main">
                <span className="claim-asset__amt">
                  {formatted} {symbol}
                </span>
                {priced && a ? <Usd amount={b.amount} asset={a} /> : null}
              </div>
              <button
                type="button"
                className="btn btn--cta btn--sm claim-asset__cta"
                disabled={busy || claimDisabled}
                onClick={() => onClaim(b.asset)}
                aria-label={`Claim ${formatted} ${symbol}`}
              >
                {isBusy ? (
                  <>
                    <span className="spinner" aria-hidden /> Claiming…
                  </>
                ) : (
                  "Claim"
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {busy ? (
        <p className="claim-card__sub" role="status">
          Keep this tab open until the claim is submitted.
        </p>
      ) : null}

      {destinationAddress ? (
        <>
          <hr className="rule" />
          <div className="claim-dest">
            <span className="claim-dest__lbl">Claiming to</span>
            <span className="claim-dest__addr" title={destinationAddress}>
              {destinationAddress}
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
}
