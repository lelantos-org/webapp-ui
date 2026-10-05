import { useEffect, useId, useRef, useState } from "react";
import { markClaimLinkCopied, retentionSentence } from "@/features/claim-links";
import { cx } from "@/shared/lib/cx";
import { CheckGlyph } from "@/shared/ui/icons/glyphs";
import { LinkActions } from "@/shared/ui/LinkActions";
import "./LinkResult.css";

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
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

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

      <LinkActions
        url={url}
        share={{ title: "Claim link", text: `Claim ${amountLabel}` }}
        onShared={() => markClaimLinkCopied(recordId)}
      />

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
