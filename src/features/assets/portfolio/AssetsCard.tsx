import { useId } from "react";
import { Link } from "react-router-dom";
import type { RegisteredAsset } from "@/config/chains";
import { useActiveChain } from "@/features/chain";
import { useWallet } from "@/features/wallet";
import { userMessage } from "@/shared/lib/errors";
import { TokenIcon } from "@/shared/ui/icons/TokenIcon";
import { RateLabelView } from "../yield/RateLabelView";
import { rateLabel } from "../yield/rate-label";
import { AssetList } from "./AssetList";
import { supportedLine } from "./asset-copy";
import { ManageWalletData } from "./ManageWalletData";
import { usePortfolio } from "./use-portfolio";
import "./AssetsCard.css";

/// "Your assets": the breakdown under the hero, with the way into wallet-data maintenance.
export function AssetsCard() {
  const { shielded, rows, assets, byId, prices, gains } = usePortfolio();
  const titleId = useId();

  return (
    <section className="pf-assets" aria-labelledby={titleId}>
      <div className="pf-assets__hdr">
        <h2 className="pf-assets__t" id={titleId}>
          Your assets
        </h2>
        <ManageWalletData className="pf-assets__manage" />
      </div>

      {rows === undefined ? (
        shielded.error ? (
          <div className="pf-list pf-list--msg">
            Your assets appear once a sync succeeds. {userMessage(shielded.error)}
          </div>
        ) : (
          <AssetListSkeleton />
        )
      ) : rows.length === 0 ? (
        <EmptyAssets assets={assets} />
      ) : (
        <AssetList rows={rows} byId={byId} prices={prices} gains={gains} />
      )}
    </section>
  );
}

function AssetListSkeleton() {
  return (
    <div className="pf-list" role="status" aria-busy="true" aria-label="Loading your assets">
      {[0, 1].map((i) => (
        <div key={i} className="pf-skel-row" aria-hidden>
          <span className="skel-bar pf-skel-row__mark" />
          <span className="pf-skel-row__left">
            <span className="skel-bar pf-skel-row__bar" style={{ width: 58 }} />
            <span className="skel-bar pf-skel-row__bar" style={{ width: 88, height: 10 }} />
          </span>
          <span className="skel-bar pf-skel-row__bar" style={{ width: 74, height: 13 }} />
        </div>
      ))}
      <div className="pf-list__foot">
        <span className="pf-list__spin" aria-hidden />
        Your assets appear when the count finishes.
      </div>
    </div>
  );
}

/// Registry order, never ranked by rate: a sorted list would read as a recommendation.
function EmptyAssets({ assets }: { assets: readonly RegisteredAsset[] }) {
  const chain = useActiveChain();
  const { capabilities } = useWallet();
  const canShield = capabilities.deposit.allowed;
  const anyRate = assets.some((a) => rateLabel(a).kind === "rate");

  return (
    <div className="pf-list pf-empty">
      <div className="pf-empty__head">
        <p className="pf-empty__t">Nothing shielded yet</p>
        <p className="pf-empty__sub">{supportedLine(assets.length, chain.chainName)}</p>
      </div>
      {assets.length > 0 ? (
        <ul className="pf-empty__rows">
          {assets.map((a) => (
            <li key={a.id.toString()} className="pf-empty__row">
              <TokenIcon symbol={a.symbol} address={a.token} className="pf-empty__mark" />
              <span className="pf-empty__sym">
                {a.symbol}
                {a.vaultName ? <span className="pf-empty__vault"> · {a.vaultName}</span> : null}
              </span>
              <RateLabelView asset={a} variant="compact" />
            </li>
          ))}
        </ul>
      ) : null}
      {assets.length > 0 ? (
        <div className="pf-empty__foot">
          {canShield ? (
            <Link to="/shield" className="btn btn--cta pf-empty__cta">
              Shield an asset
            </Link>
          ) : (
            <p className="pf-empty__note">
              This wallet can&rsquo;t shield from a public account. To add funds, have someone send
              to your shielded address below, or claim a link sent to you.
            </p>
          )}
          {anyRate ? (
            <p className="pf-empty__note">
              Rates are what each venue returned recently, net of the pool&rsquo;s cut. An estimate,
              not a promise.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
