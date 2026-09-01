// Post-generation view for a claim link.
//
// The screen has one job: get the link to its recipient. It reads top to bottom
// as what, risk, action. The URL is an escape hatch rather than the headline —
// it is masked by default and unreadable while masked — so it is demoted below
// the actions.

import { useId, useState } from "react";
import { createLogger } from "@/shared/lib/logger";
import { useCopy } from "@/shared/lib/use-copy";

const log = createLogger("claim-link:result");

const MASK_LENGTH = 24;

export interface ClaimLinkResultProps {
  url: string;
  amountLabel: string;
  onReset(): void;
}

export function ClaimLinkResult({ url, amountLabel, onReset }: ClaimLinkResultProps) {
  const [revealed, setRevealed] = useState(false);
  const { copy, copied } = useCopy(url);
  const titleId = useId();

  const masked = url.replace(/#.*$/, `#${"•".repeat(MASK_LENGTH)}`);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function shareLink() {
    if (!canShare) return;
    try {
      await navigator.share({ url, title: "claim link", text: `claim ${amountLabel}` });
    } catch (e) {
      // Cancelling the share sheet rejects and is the common case, so it is
      // recorded rather than reported to the user.
      log.debug("share dismissed", e);
    }
  }

  return (
    <section className="claim-result" aria-labelledby={titleId}>
      <h2 id={titleId} className="claim-result__t">
        link ready
      </h2>
      {amountLabel ? <p className="claim-result__amount mono">{amountLabel}</p> : null}

      {/* Placed ahead of the buttons: this is a bearer secret and sending it
          carelessly is unrecoverable, so the warning must precede the copy. */}
      <p className="claim-result__warn">
        Anyone who opens this link claims the funds. It works <strong>once</strong> and cannot be
        cancelled — send it through a channel you trust.
      </p>

      <div className="claim-result__actions">
        <button type="button" className="btn" onClick={() => void copy()}>
          copy link
        </button>
        {canShare ? (
          <button type="button" className="btn btn--ghost" onClick={() => void shareLink()}>
            share…
          </button>
        ) : null}
        {/* A fixed slot rather than a label swap on the button, so the
            confirmation does not shift the layout and is announced by a screen
            reader. */}
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
