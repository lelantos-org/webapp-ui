import type { ReactNode } from "react";
import { shortAddr } from "@/shared/lib/address";
import { cx } from "@/shared/lib/cx";
import { CheckGlyph, InfoGlyph } from "@/shared/ui/icons/glyphs";
import { CopyHash, TxHashRow } from "./TxHashRow";
import "./txcard.css";

/// An operation's position in a bundled transaction.
export interface TxOperation {
  /// 1-based.
  index: number;
  count: number;
  commitment: string;
}

export interface TxSettledCardProps {
  /// E.g. "Sent privately", "Shielded".
  title: string;
  /// The op was sent but not seen to land: no success mark.
  unconfirmed?: boolean;
  /// Formatted amount, e.g. "250.00 USDC".
  amount?: ReactNode;
  /// The transaction row is hidden when omitted.
  hash?: string | undefined;
  /// Omitted when the chain has no explorer; copy still works.
  explorerUrl?: string | undefined;
  /// Set when the relayer bundled several operations.
  operation?: TxOperation | undefined;
  /// Shown under the transaction row.
  note?: ReactNode;
  /// Trailing control, e.g. a "Done" button.
  action?: ReactNode;
}

/// Terminal card for a settled action.
export function TxSettledCard({
  title,
  unconfirmed = false,
  amount,
  hash,
  explorerUrl,
  operation,
  note,
  action,
}: TxSettledCardProps) {
  return (
    <section
      className="surface surface--card txcard txcard--settled"
      role="status"
      aria-label={title}
    >
      <div className="txcard__head">
        <span
          className={cx("glyph-ring txcard__ring", unconfirmed && "txcard__ring--warn")}
          aria-hidden="true"
        >
          {unconfirmed ? <InfoGlyph size={21} /> : <CheckGlyph size={21} />}
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
            <CopyHash hash={hash} />
          </TxHashRow>
          {operation ? (
            <div className="txcard__tx">
              <span className="txcard__sub">
                Operation {operation.index} of {operation.count}
              </span>
              <span className="txcard__hash mono" title={operation.commitment}>
                {shortAddr(operation.commitment, 4)}
              </span>
            </div>
          ) : null}
        </>
      ) : null}
      {note ? <p className="txcard__sub txcard__p">{note}</p> : null}
      {action ? <div className="txcard__actions txcard__actions--one">{action}</div> : null}
    </section>
  );
}
