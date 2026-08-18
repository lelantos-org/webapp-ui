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

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { findAsset, type RegisteredAsset } from "@/features/assets/registered-assets";
import {
  claimLinksSnapshot,
  forgetClaimLink,
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
  const links = useMemo(() => selectClaimLinks(all, chainId), [all, chainId]);

  if (links.length === 0) return null;

  return (
    <section className="stack stack--sm mt-3">
      <h4 className="card__t">links you generated</h4>
      <p className="muted txt-xs">
        Kept in this browser so a network switch or a closed tab cannot lose them. Remove one once
        the recipient has it — anyone holding the link can claim the funds.
      </p>
      <ul className="stack stack--sm">
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
  const amount = asset
    ? `${formatAmountForAsset(BigInt(link.amount), asset.decimals, asset.scale)} ${asset.symbol}`
    : link.amount;

  const forget = useCallback(() => forgetClaimLink(link.id), [link.id]);

  return (
    <li className="row">
      <span className="mono grow">{amount}</span>
      {/* A record with no `txHash` means the transfer may never have gone out.
          Said plainly rather than hidden: the alternative to showing it is
          hiding a link that might be live. */}
      {link.txHash ? null : <span className="muted txt-xs">unconfirmed</span>}
      <button
        type="button"
        className="btn"
        onClick={() => void copyWithToast(link.url, "link copied")}
      >
        copy
      </button>
      {confirming ? (
        <>
          <button type="button" className="lnk lnk--inline warn" onClick={forget}>
            forget it?
          </button>
          <button type="button" className="lnk lnk--inline" onClick={() => setConfirming(false)}>
            cancel
          </button>
        </>
      ) : (
        <button type="button" className="lnk lnk--inline" onClick={() => setConfirming(true)}>
          done with this
        </button>
      )}
    </li>
  );
}
