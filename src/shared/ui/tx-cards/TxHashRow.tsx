import type { ReactNode } from "react";
import { useCopy } from "@/shared/hooks/use-copy";
import { shortAddr } from "@/shared/lib/address";
import "./txcard.css";

/// Transaction row of a tx card: truncated hash, `children` controls, explorer link.
export function TxHashRow({
  hash,
  explorerUrl,
  children,
}: {
  hash: string;
  explorerUrl: string | undefined;
  children?: ReactNode;
}) {
  return (
    <div className="txcard__tx">
      <span className="txcard__sub">Transaction</span>
      <span className="txcard__hash mono" title={hash}>
        {shortAddr(hash, 4)}
      </span>
      {children}
      {explorerUrl ? (
        <a
          className="link-btn txcard__link"
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Explorer ↗
        </a>
      ) : null}
    </div>
  );
}

/// Copies the full hash: the row shows only its ends.
export function CopyHash({ hash }: { hash: string }) {
  const { copy, copied } = useCopy(hash);
  return (
    <button type="button" className="link-btn txcard__link" onClick={() => void copy()}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
