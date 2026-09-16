import { useState } from "react";
import { copyWithToast } from "@/shared/hooks/use-copy";
import { relativeTime } from "@/shared/lib/format/time";
import { dropsBadge } from "../copy";
import { claimLinkExpiresIn } from "../policy";
import type { StoredClaimLink } from "../record";
import { forgetClaimLink, markClaimLinkCopied } from "../store";
import "./vault.css";

export interface VaultRowProps {
  link: StoredClaimLink;
  amount: string;
  /// Set when the record belongs to a network other than the active one.
  chainName: string | undefined;
  now: number;
}

export function VaultRow({ link, amount, chainName, now }: VaultRowProps) {
  const [confirming, setConfirming] = useState(false);
  const drops = dropsBadge(claimLinkExpiresIn(link, now));

  const copy = () => {
    void copyWithToast(link.url, "Link copied");
    markClaimLinkCopied(link.id);
  };

  return (
    <li className="vault-row">
      <div className="vault-row__main">
        <span className="vault-row__amt">{amount}</span>
        {/* A record with no `txHash` means the transfer may never have gone out.
            Shown rather than hidden, since the alternative is concealing a link
            that may be live. */}
        {link.txHash ? null : (
          <span className="vault-tag vault-tag--warn" title="The transfer may not have gone out">
            unconfirmed
          </span>
        )}
        {drops ? <span className="vault-tag vault-tag--err">{drops}</span> : null}
        {link.copiedAt !== undefined ? <span className="vault-tag">shared</span> : null}
        {chainName ? <span className="vault-tag">{chainName}</span> : null}
      </div>
      <span className="vault-row__age">{relativeTime(link.createdAt, now)}</span>
      {/* Two-step delete in a fixed lane, so confirming one row shifts nothing. */}
      <div className="vault-row__actions">
        {confirming ? (
          <>
            <button
              type="button"
              className="vault-btn vault-btn--err"
              onClick={() => forgetClaimLink(link.id)}
            >
              Yes, delete
            </button>
            <button type="button" className="vault-btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="vault-btn vault-btn--strong"
              onClick={copy}
              // Every row's button reads "Copy"; the amount tells them apart.
              aria-label={`Copy the link for ${amount}`}
            >
              Copy
            </button>
            <button
              type="button"
              className="vault-btn vault-btn--mute"
              onClick={() => setConfirming(true)}
              aria-label={`Delete my copy of the link for ${amount}`}
            >
              Delete my copy
            </button>
          </>
        )}
      </div>
    </li>
  );
}
