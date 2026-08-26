import { shortAddr } from "@/shared/lib/format";
import { useCopy } from "@/shared/lib/use-copy";

export interface TxHashProps {
  hash: string;
  /// Explorer link for `hash`. Omitted when the chain has no explorer configured;
  /// the row still renders and copy still works.
  url?: string;
}

/// One tx hash, as a left-aligned row: label, truncated hash, copy, explorer. A
/// full 66-character hash wraps mid-string, so it is truncated; the untruncated
/// value stays reachable through `title` and the clipboard.
export function TxHash({ hash, url }: TxHashProps) {
  const { copy, copied } = useCopy(hash);

  return (
    <div className="txhash">
      <span className="txhash__label">tx</span>
      <span className="txhash__val mono" title={hash}>
        {shortAddr(hash, 8)}
      </span>
      <button type="button" className="txhash__act" onClick={() => void copy()}>
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
