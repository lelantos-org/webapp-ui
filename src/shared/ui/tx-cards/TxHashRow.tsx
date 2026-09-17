import type { ReactNode } from "react";
import { shortAddr } from "@/shared/lib/address";
import "./txcard.css";

/// A tx card's transaction row: truncated hash, the card's controls, and the explorer link.
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
