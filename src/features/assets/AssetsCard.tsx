import { useId, useState } from "react";
import { Link } from "react-router-dom";
import type { RegisteredAsset } from "@/config/chains";
import { useActiveChain } from "@/features/chain";
import { useWallet, useWalletState } from "@/features/wallet";
import { userMessage } from "@/shared/lib/errors";
import { TokenIcon } from "@/shared/ui/icons/TokenIcon";
import { AssetList } from "./AssetList";
import { supportedLine } from "./asset-copy";
import { RateLabelView } from "./RateLabelView";
import { rateLabel } from "./rate-label";
import { usePortfolio } from "./use-portfolio";
import { WalletDataModal } from "./WalletDataModal";
import "./AssetsCard.css";

/// "Your assets": the breakdown under the hero, and the one way into the
/// wallet-data maintenance modal.
///
/// No refresh control: the wallet re-syncs on its own whenever the server has
/// something new, and a button implying otherwise would be noise. A failed sync
/// is stated in the hero, with its own retry.
export function AssetsCard() {
  const { shielded, rows, assets, byId, prices, gains } = usePortfolio();
  const titleId = useId();

  return (
    <section className="pf-assets" aria-labelledby={titleId}>
      <div className="pf-assets__hdr">
        <h2 className="pf-assets__t" id={titleId}>
          Your assets
        </h2>
        <ManageWalletData />
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

/// "Manage wallet data" — compact and hard refresh, behind a surface with room
/// to say what each costs.
///
/// Reads `isFetching` itself, where tracking it is the point: both actions are
/// refused while a sync is running.
function ManageWalletData() {
  const [managing, setManaging] = useState(false);
  const { isFetching } = useWalletState();
  return (
    <>
      <button
        type="button"
        className="link-btn pf-assets__manage"
        onClick={() => setManaging(true)}
      >
        Manage wallet data
      </button>
      {managing ? (
        <WalletDataModal syncing={isFetching} onClose={() => setManaging(false)} />
      ) : null}
    </>
  );
}

/// First sync still running. Rows cannot appear one by
/// one — balances exist only once the scan and its spend reconciliation finish —
/// so the footer says when they will, rather than "as they are found".
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

/// Finished, and genuinely nothing held. The only state that offers the action, and it lists what can be
/// shielded here before asking for a commitment — a first-time user otherwise
/// gets an empty table and a button.
///
/// Registry order, never ranked by rate: a sorted list is a recommendation the
/// wallet has no basis for.
///
/// The call to action follows the deposit capability, as the Shield tile above
/// it does. A passkey wallet cannot shield, and a filled "Shield an asset" under
/// a disabled Shield tile would promise the one thing that wallet cannot do; it
/// gets the ways in it does have instead.
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
              <span className="pf-empty__sym">{a.symbol}</span>
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
