import { useCopy } from "@/shared/hooks/use-copy";
import { cx } from "@/shared/lib/cx";
import { createLogger } from "@/shared/lib/logger";
import "./LinkActions.css";

const log = createLogger("link-actions");

export interface LinkActionsProps {
  url: string;
  /// What the system share sheet is given beside the link.
  share: { title: string; text: string };
  /// Called once the link was copied or handed to the share sheet.
  onShared?(): void;
}

/// Copy a link, or share it where the browser can.
export function LinkActions({ url, share, onShared }: LinkActionsProps) {
  const { copy, copied } = useCopy(url);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyLink() {
    await copy();
    onShared?.();
  }

  async function shareLink() {
    try {
      await navigator.share({ url, ...share });
      onShared?.();
    } catch (e) {
      log.debug("share dismissed", e);
    }
  }

  return (
    <>
      <div className={cx("link-actions", !canShare && "link-actions--one")}>
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
    </>
  );
}
