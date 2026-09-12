import type { ReactNode } from "react";
import { shortAddr } from "@/shared/lib/address";
import { useCopy } from "@/shared/lib/use-copy";
import { CheckGlyph } from "./glyphs";
import "./txcard.css";

export interface TxSettledCardProps {
  /// What happened, in the op's own words: "Sent privately", "Shielded".
  title: string;
  /// The figure moved, "250.00 USDC". Omitted when the caller no longer has it.
  amount?: ReactNode;
  /// The transaction hash. The row is withheld without one.
  hash?: string | undefined;
  /// Explorer link for `hash`. Omitted when the chain has none; copy still works.
  explorerUrl?: string | undefined;
  /// Anything worth saying after the fact, under the transaction row.
  note?: ReactNode;
  /// Trailing control, such as "Done" returning to the form.
  action?: ReactNode;
}

/// The card an action ends on: a tick, what happened, and the transaction.
///
/// The hash is truncated for reading and copied whole; the full value stays in
/// `title` for hover.
export function TxSettledCard({
  title,
  amount,
  hash,
  explorerUrl,
  note,
  action,
}: TxSettledCardProps) {
  const { copy, copied } = useCopy(hash ?? "");
  return (
    <section
      className="surface surface--card txcard txcard--settled"
      role="status"
      aria-label={title}
    >
      <div className="txcard__head">
        <span className="glyph-ring txcard__ring" aria-hidden="true">
          <CheckGlyph size={21} />
        </span>
        <div className="txcard__heading">
          <span className="txcard__t txcard__t--sm">{title}</span>
          {amount ? <span className="txcard__sub mono">{amount}</span> : null}
        </div>
      </div>
      {hash ? (
        <>
          <div className="rule" />
          <TxHashRow hash={hash} explorerUrl={explorerUrl}>
            <button type="button" className="link-btn txcard__link" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </TxHashRow>
        </>
      ) : null}
      {note ? <p className="txcard__sub txcard__p">{note}</p> : null}
      {action ? <div className="txcard__actions txcard__actions--one">{action}</div> : null}
    </section>
  );
}

/// A tx card's transaction row: the hash, truncated for reading with the full
/// value in `title`, any controls of the card's own, and the explorer link.
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
