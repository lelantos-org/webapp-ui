// Recovery list for claim links this browser generated.
//
// A claim link's spending key exists only in the URL the sender holds.
// `link-vault` writes the record before the transfer goes out, and this list is
// where the sender recovers it if the page state is lost.
//
// Records are dropped explicitly, via "done with this". Nothing here can observe
// whether the recipient has claimed, so the list is the sender's to curate and
// the vault's TTL is only a backstop.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { findAsset, type RegisteredAsset } from "@/features/assets";
import { formatAssetAmount } from "@/shared/lib/format";
import { copyWithToast } from "@/shared/lib/use-copy";
import {
  claimLinksSnapshot,
  forgetClaimLink,
  pruneExpiredClaimLinks,
  type StoredClaimLink,
  selectClaimLinks,
  subscribeClaimLinks,
} from "../link-vault";

/// Label for a stored record's amount.
///
/// Exported for the test covering the unregistered-asset branch: `amount` is in
/// circuit units, and without a registered asset there is no scale to apply, so
/// the raw figure is labelled with the asset id rather than printed bare beside
/// properly denominated ones.
///
/// `BigInt` cannot throw here: `link-vault` rejects any record whose `amount` is
/// not a digit string, so this is safe inside a render.
export function describeStoredAmount(
  link: StoredClaimLink,
  assets: readonly RegisteredAsset[],
): string {
  const asset = findAsset(assets, link.assetId);
  return asset
    ? formatAssetAmount(BigInt(link.amount), asset)
    : `${link.amount} (asset #${link.assetId})`;
}

export interface UnclaimedLinksProps {
  chainId: bigint;
  assets: readonly RegisteredAsset[];
}

export function UnclaimedLinks({ chainId, assets }: UnclaimedLinksProps) {
  const stored = useSyncExternalStore(subscribeClaimLinks, claimLinksSnapshot, claimLinksSnapshot);
  const links = useMemo(() => selectClaimLinks(stored, chainId), [stored, chainId]);

  usePruneOnMount();

  if (links.length === 0) return null;

  return (
    <section className="link-vault">
      <h2 className="link-vault__t">links you generated</h2>
      <p className="link-vault__note">
        Kept in this browser so a network switch or a closed tab cannot lose them. Removing a record
        deletes your copy of the link — it does not revoke anything, and anyone still holding the
        link can claim the funds.
      </p>
      <ul className="link-vault__list">
        {links.map((link) => (
          <LinkRow key={link.id} link={link} assets={assets} />
        ))}
      </ul>
    </section>
  );
}

/// Sweep records past the TTL out of storage, once per mount.
///
/// Expiry is otherwise enforced only on write, so a wallet that sent one link and
/// stopped would keep that record — and its spending key — on disk indefinitely,
/// hidden behind `selectClaimLinks`' filter. Running it from an effect keeps the
/// write out of the render pass.
///
/// Mount-only suffices: every later change to the store goes through the vault's
/// write path, which prunes as it goes.
function usePruneOnMount(): void {
  useEffect(() => {
    pruneExpiredClaimLinks();
  }, []);
}

interface LinkRowProps {
  link: StoredClaimLink;
  assets: readonly RegisteredAsset[];
}

function LinkRow({ link, assets }: LinkRowProps) {
  const [confirming, setConfirming] = useState(false);
  const amount = describeStoredAmount(link, assets);

  const copy = useCallback(() => {
    void copyWithToast(link.url, "link copied");
  }, [link.url]);

  const forget = useCallback(() => {
    forgetClaimLink(link.id);
  }, [link.id]);

  return (
    <li className="link-vault__row">
      <span className="link-vault__amount">{amount}</span>
      {/* A record with no `txHash` means the transfer may never have gone out.
          Shown rather than hidden, since the alternative is concealing a link
          that may be live. */}
      {link.txHash ? null : (
        <span className="link-vault__badge" title="the transfer may not have been broadcast">
          unconfirmed
        </span>
      )}
      <div className="link-vault__actions">
        {confirming ? (
          <ConfirmForgetActions onConfirm={forget} onCancel={() => setConfirming(false)} />
        ) : (
          <DefaultActions amount={amount} onCopy={copy} onStartForget={() => setConfirming(true)} />
        )}
      </div>
    </li>
  );
}

interface DefaultActionsProps {
  amount: string;
  onCopy(): void;
  onStartForget(): void;
}

function DefaultActions({ amount, onCopy, onStartForget }: DefaultActionsProps) {
  return (
    <>
      <button
        type="button"
        className="link-vault__act"
        onClick={onCopy}
        // Every row's button reads "copy"; the amount distinguishes them and sits
        // in a sibling element the button does not otherwise name.
        aria-label={`copy claim link for ${amount}`}
      >
        copy
      </button>
      <button
        type="button"
        className="link-vault__act link-vault__act--mute"
        onClick={onStartForget}
      >
        remove
      </button>
    </>
  );
}

interface ConfirmForgetActionsProps {
  onConfirm(): void;
  onCancel(): void;
}

/// Second step of the two-step delete. Holds the same two slots as
/// `DefaultActions`, and `.link-vault__actions` reserves the width, so confirming
/// on one row does not shift the rows below.
///
/// "delete my copy", not "forget it?": what this destroys is the local record,
/// and the link itself keeps working for whoever holds it. The old wording read
/// as revocation, which is the one thing it cannot do.
function ConfirmForgetActions({ onConfirm, onCancel }: ConfirmForgetActionsProps) {
  return (
    <>
      <button type="button" className="link-vault__act link-vault__act--warn" onClick={onConfirm}>
        delete my copy
      </button>
      <button type="button" className="link-vault__act link-vault__act--mute" onClick={onCancel}>
        cancel
      </button>
    </>
  );
}
