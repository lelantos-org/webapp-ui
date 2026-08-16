// Post-generation view for a claim link.
//
// The screen has one job: get the link to its recipient. So it reads top to
// bottom as what / risk / action, and everything that is not that is either
// demoted or gone. The URL itself is an escape hatch, not the headline — it is
// masked by default and unreadable when it is, so giving it the most visual
// weight (as the old card did) spent the page's focus on nothing.

import { useId, useState } from "react";

const MASK_LENGTH = 24;
const COPY_FEEDBACK_MS = 1500;

export interface ClaimLinkResultProps {
  url: string;
  amountLabel: string;
  onReset(): void;
}

export function ClaimLinkResult({ url, amountLabel, onReset }: ClaimLinkResultProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const titleId = useId();

  const masked = url.replace(/#.*$/, `#${"•".repeat(MASK_LENGTH)}`);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  }

  async function shareLink() {
    if (!canShare) return;
    try {
      await navigator.share({ url, title: "claim link", text: `claim ${amountLabel}` });
    } catch {
      // user cancelled — no-op
    }
  }

  return (
    <section className="claim-result" aria-labelledby={titleId}>
      <h3 id={titleId} className="claim-result__t">
        link ready
      </h3>
      {amountLabel ? <p className="claim-result__amount mono">{amountLabel}</p> : null}

      {/* Ahead of the buttons on purpose: this is a bearer secret, and the
          consequence of sending it carelessly is unrecoverable. Reading it
          after the copy would be reading it too late. */}
      <p className="claim-result__warn">
        Anyone who opens this link claims the funds. It works <strong>once</strong> and cannot be
        cancelled — send it through a channel you trust.
      </p>

      <div className="claim-result__actions">
        <button type="button" className="btn" onClick={copyLink}>
          copy link
        </button>
        {canShare ? (
          <button type="button" className="btn btn--ghost" onClick={shareLink}>
            share…
          </button>
        ) : null}
        {/* Fixed slot rather than a label swap on the button: the confirmation
            does not shift the layout, and a screen reader hears it announced. */}
        <span className="claim-result__copied" role="status" aria-live="polite">
          {copied ? "copied ✓" : ""}
        </span>
      </div>

      <div className="claim-result__link">
        <code className="claim-result__url">{revealed ? url : masked}</code>
        <button
          type="button"
          className="txt-btn"
          onClick={() => setRevealed((v) => !v)}
          aria-pressed={revealed}
        >
          {revealed ? "hide" : "reveal"}
        </button>
      </div>

      <button type="button" className="txt-btn claim-result__reset" onClick={onReset}>
        generate another link
      </button>
    </section>
  );
}
