import type { ReactNode } from "react";
import { useCopy } from "@/shared/hooks/use-copy";
import { shortAddr } from "@/shared/lib/address";
import { CheckGlyph } from "@/shared/ui/icons/glyphs";
import { TxHashRow } from "./TxHashRow";
import "./txcard.css";

/// One operation's place in a bundled transaction.
export interface TxOperation {
  /// 1-based.
  index: number;
  count: number;
  /// The commitment naming the operation.
  commitment: string;
}

export interface TxSettledCardProps {
  /// What happened, in the op's own words: "Sent privately", "Shielded".
  title: string;
  /// The figure moved, "250.00 USDC". Omitted when the caller no longer has it.
  amount?: ReactNode;
  /// The transaction hash. The row is withheld without one.
  hash?: string | undefined;
  /// Explorer link for `hash`. Omitted when the chain has none; copy still works.
  explorerUrl?: string | undefined;
  /// Which operation this was, when the relayer bundled several. Withheld for a lone one.
  operation?: TxOperation | undefined;
  /// Anything worth saying after the fact, under the transaction row.
  note?: ReactNode;
  /// Trailing control, such as "Done" returning to the form.
  action?: ReactNode;
}

/// The card an action ends on: a tick, what happened, and the transaction.
export function TxSettledCard({
  title,
  amount,
  hash,
  explorerUrl,
  operation,
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
