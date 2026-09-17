import { Link } from "react-router-dom";
import { type ProposalListItem, votingPhase } from "@/features/governance";
import { shortAddr } from "@/shared/lib/address";
import { phaseLine } from "../governance-copy";
import { StateBadge } from "./StateBadge";
import { TallyBar } from "./TallyBar";

export interface ProposalRowProps {
  proposal: ProposalListItem;
  now: number;
  decimals: number;
  symbol: string;
}

export function ProposalRow({ proposal: p, now, decimals, symbol }: ProposalRowProps) {
  const state = p.chain?.state;
  const phase = votingPhase(state, p, now);
  const line = phaseLine(phase, p, now);
  return (
    <li className="gov-row">
      <Link to={`/governance/${p.id}`} className="gov-row__link">
        <span className="gov-row__top">
          <StateBadge state={state} phase={phase} />
          {line ? <span className="gov-row__when">{line}</span> : null}
        </span>
        <span className="gov-row__title">{p.title || `Proposal ${shortAddr(p.id, 6)}`}</span>
        <span className="gov-row__meta muted">
          by <span className="mono">{shortAddr(p.proposer, 4)}</span> · {p.voteCount}{" "}
          {p.voteCount === 1 ? "vote" : "votes"}
        </span>
        <TallyBar
          tallies={p.tallies}
          quorum={p.chain?.quorum}
          decimals={decimals}
          symbol={symbol}
          compact
        />
      </Link>
    </li>
  );
}
