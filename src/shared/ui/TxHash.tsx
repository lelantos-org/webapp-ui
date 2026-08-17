import { useState } from "react";
import { shortAddr } from "@/shared/lib/format";

export interface TxHashProps {
  hash: string;
  /// Explorer link for `hash`. Omitted when the chain has no explorer
  /// configured — the row still renders, copy still works.
  url?: string;
}

/// One tx hash, rendered as a left-aligned row: label, truncated hash, copy,
/// explorer. A full 66-char hash wrapped mid-string reads as ragged text and
/// nobody transcribes one by eye anyway — the copy button is the real action,
/// and the untruncated value stays reachable via `title` and the clipboard.
export function TxHash({ hash, url }: TxHashProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="txhash">
      <span className="txhash__label">tx</span>
      <span className="txhash__val mono" title={hash}>
        {shortAddr(hash, 8)}
      </span>
      <button type="button" className="txhash__act" onClick={copy}>
        {copied ? "copied" : "copy"}
      </button>
      {url ? (
        <a className="txhash__act" href={url} target="_blank" rel="noopener noreferrer">
          explorer ↗
        </a>
      ) : null}
    </div>
  );
}
