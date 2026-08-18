// Recovery list for claim links this browser generated.
//
// A claim link's spending key exists in exactly two places: the URL the sender
// holds, and nowhere else. Before this list, "nowhere else" was literal — the
// only copy lived in React state that any chain or account switch discarded,
// with the funds already sent. `link-vault` writes the record before the
// transfer goes out; this is where the sender gets it back.
//
// Records are dropped explicitly, via "done with this". Nothing here can
// observe whether the recipient has claimed, so the list is the sender's to
// curate; the vault's TTL is only a backstop.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { findAsset, type RegisteredAsset } from "@/features/assets/registered-assets";
import {
  claimLinksSnapshot,
  forgetClaimLink,
  pruneExpiredClaimLinks,
  type StoredClaimLink,
  selectClaimLinks,
  subscribeClaimLinks,
} from "@/features/claim-link/link-vault";
import { formatAmountForAsset } from "@/shared/lib/format";
import { copyWithToast } from "@/shared/lib/use-copy";

export interface UnclaimedLinksProps {
  chainId: bigint;
  assets: readonly RegisteredAsset[];
}

export function UnclaimedLinks({ chainId, assets }: UnclaimedLinksProps) {
  const all = useSyncExternalStore(subscribeClaimLinks, claimLinksSnapshot, claimLinksSnapshot);

  // Expiry is enforced on write, so a wallet that sent one link and stopped
  // kept that record — and its spending key — on disk forever, invisible behind
  // `selectClaimLinks`' filter. Sweeping from an effect keeps the write out of
  // the render pass, which is what made the old prune-inside-the-read a
  // problem.
  //
  // Mount-only is the whole job: every later change to the store goes through
  // `write`, which prunes on the way past. Keying this on the snapshot instead
  // would re-run it for each of those writes to find nothing.
  useEffect(() => {
    pruneExpiredClaimLinks();
  }, []);

  const links = useMemo(() => selectClaimLinks(all, chainId), [all, chainId]);

  if (links.length === 0) return null;

  return (
    <section className="link-vault">
      <h4 className="link-vault__t">links you generated</h4>
      <p className="link-vault__note">
        Kept in this browser so a network switch or a closed tab cannot lose them. Remove one once
        the recipient has it — anyone holding the link can claim the funds.
      </p>
      <ul className="link-vault__list">
        {links.map((l) => (
          <LinkRow key={l.id} link={l} assets={assets} />
        ))}
      </ul>
    </section>
  );
}

function LinkRow({ link, assets }: { link: StoredClaimLink; assets: readonly RegisteredAsset[] }) {
  const [confirming, setConfirming] = useState(false);
  const asset = findAsset(assets, link.assetId);

  // `link.amount` is in circuit units. Without a registered asset there is no
  // way to scale it, so the raw figure is labelled as such rather than printed
  // bare next to amounts that *are* denominated — the two differ by orders of
  // magnitude and looked identical. `BigInt` is safe here: `link-vault` rejects
  // any record whose amount is not a digit string.
  const amount = asset
    ? `${formatAmountForAsset(BigInt(link.amount), asset.decimals, asset.scale)} ${asset.symbol}`
    : `${link.amount} (asset #${link.assetId})`;

  const forget = useCallback(() => forgetClaimLink(link.id), [link.id]);

  return (
    <li className="link-vault__row">
      <span className="link-vault__amount">{amount}</span>
      {/* A record with no `txHash` means the transfer may never have gone out.
          Said plainly rather than hidden: the alternative to showing it is
          hiding a link that might be live. */}
      {link.txHash ? null : (
        <span className="link-vault__badge" title="the transfer may not have been broadcast">
          unconfirmed
        </span>
      )}
      <div className="link-vault__actions">
        {confirming ? (
          <>
            <button
              type="button"
              className="link-vault__act link-vault__act--warn"
              onClick={forget}
            >
              forget it?
            </button>
            <button
              type="button"
              className="link-vault__act link-vault__act--mute"
              onClick={() => setConfirming(false)}
            >
              cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="link-vault__act"
              onClick={() => void copyWithToast(link.url, "link copied")}
              aria-label={`copy claim link for ${amount}`}
            >
              copy
            </button>
            <button
              type="button"
              className="link-vault__act link-vault__act--mute"
              onClick={() => setConfirming(true)}
            >
              done with this
            </button>
          </>
        )}
      </div>
    </li>
  );
}
