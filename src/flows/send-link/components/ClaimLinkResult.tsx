// Post-generation view for a claim link: Send by link's "2 · Share" card.
//
// The screen has one job: get the link to its recipient. It reads top to bottom
// as what was sent, the link, the two ways to hand it over. The risk was stated
// on the compose card and acknowledged there, so it is not repeated here. The URL
// is masked by default and unreadable while masked, so it is a check rather than
// the headline.

import { useEffect, useId, useRef, useState } from "react";
import { markClaimLinkCopied, retentionSentence } from "@/features/claim-links";
import { cx } from "@/shared/lib/cx";
import { createLogger } from "@/shared/lib/logger";
import { useCopy } from "@/shared/lib/use-copy";
import { CheckGlyph } from "@/shared/ui/glyphs";
import "./ClaimLinkResult.css";

const log = createLogger("claim-link:result");

export interface ClaimLinkResultProps {
  url: string;
  amountLabel: string;
  /// The vault record for this link, marked "shared" on copy or share.
  recordId: string;
  /// The vault's retention window, for the promise under the buttons.
  ttlMs: number;
  onReset(): void;
}

export function ClaimLinkResult({
  url,
  amountLabel,
  recordId,
  ttlMs,
  onReset,
}: ClaimLinkResultProps) {
  const [revealed, setRevealed] = useState(false);
  const { copy, copied } = useCopy(url);
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // Arrives below the compose card on a single column, out of view. Moving focus
  // brings it on screen and tells a screen reader the link exists.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function copyLink() {
    await copy();
    markClaimLinkCopied(recordId);
  }

  async function shareLink() {
    if (!canShare) return;
    try {
      await navigator.share({ url, title: "Claim link", text: `Claim ${amountLabel}` });
      markClaimLinkCopied(recordId);
    } catch (e) {
      // Cancelling the share sheet rejects and is the common case, so it is
      // recorded rather than reported to the user.
      log.debug("share dismissed", e);
    }
  }

  return (
    <section className="surface surface--card linkres" aria-labelledby={titleId}>
      <div className="linkres__head">
        <span className="glyph-ring linkres__ring" aria-hidden="true">
          <CheckGlyph size={26} strokeWidth={2.4} />
        </span>
        <h2 className="linkres__amt" id={titleId} ref={titleRef} tabIndex={-1}>
          {amountLabel || "Your link"}
        </h2>
        <span className="linkres__sub">sent — your link is ready</span>
      </div>

      <div className="linkres__url">
        <code className={cx("linkres__code", revealed && "linkres__code--open")}>
          {revealed ? url : maskClaimUrl(url)}
        </code>
        <button
          type="button"
          className="link-btn linkres__reveal"
          onClick={() => setRevealed((v) => !v)}
          aria-pressed={revealed}
        >
          {revealed ? "Hide" : "Reveal"}
        </button>
      </div>

      <div className={cx("linkres__actions", !canShare && "linkres__actions--one")}>
        <button type="button" className="btn btn--cta btn--sm" onClick={() => void copyLink()}>
          {copied ? "Copied" : "Copy link"}
        </button>
        {canShare ? (
          <button type="button" className="btn btn--outline" onClick={() => void shareLink()}>
            Share…
          </button>
        ) : null}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>

      <p className="footnote">{retentionSentence(ttlMs)}</p>

      <button type="button" className="link-btn linkres__again" onClick={onReset}>
        Create another link
      </button>
    </section>
  );
}

/// Fixed width, so the masked form says nothing about the length of the secret.
const MASK_LENGTH = 16;

/// Display form of the link: no scheme, fragment masked.
export function maskClaimUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/#.*$/, `#${"•".repeat(MASK_LENGTH)}`);
}
