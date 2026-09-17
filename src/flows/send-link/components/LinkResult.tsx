import { useEffect, useId, useRef, useState } from "react";
import { markClaimLinkCopied, retentionSentence } from "@/features/claim-links";
import { useCopy } from "@/shared/hooks/use-copy";
import { cx } from "@/shared/lib/cx";
import { createLogger } from "@/shared/lib/logger";
import { CheckGlyph } from "@/shared/ui/icons/glyphs";
import "./LinkResult.css";

const log = createLogger("claim-link:result");

export interface LinkResultProps {
  url: string;
  amountLabel: string;
  recordId: string;
  /// The vault's retention window.
  ttlMs: number;
  onReset(): void;
}

/// The created claim link, masked by default, with copy and share actions.
export function LinkResult({ url, amountLabel, recordId, ttlMs, onReset }: LinkResultProps) {
  const [revealed, setRevealed] = useState(false);
  const { copy, copied } = useCopy(url);
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

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

/// Fixed, so the mask does not leak the secret's length.
const MASK_LENGTH = 16;

/// Display form of the link: no scheme, fragment masked.
export function maskClaimUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/#.*$/, `#${"•".repeat(MASK_LENGTH)}`);
}
