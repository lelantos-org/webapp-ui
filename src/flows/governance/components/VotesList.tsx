import { useProposalVotes } from "@/features/governance";
import { shortAddr } from "@/shared/lib/address";
import { formatVotes, SUPPORT_LABEL } from "../governance-copy";

export function VotesList({
  proposalId,
  decimals,
  symbol,
}: {
  proposalId: string;
  decimals: number;
  symbol: string;
}) {
  const v = useProposalVotes(proposalId);
  if (v.error) return <p className="muted">Could not load the votes.</p>;
  if (v.isLoading) return <p className="muted">Loading votes…</p>;
  if (v.votes.length === 0) return <p className="muted">No votes yet.</p>;
  return (
    <>
      <ul className="gov-votes">
        {v.votes.map((vote) => (
          <li key={`${vote.voter}-${vote.txHash}`} className="gov-vote-row">
            <span className="mono" title={vote.voter}>
              {shortAddr(vote.voter, 4)}
            </span>
            <span
              className={`gov-support gov-support--${SUPPORT_LABEL[vote.support].toLowerCase()}`}
            >
              {SUPPORT_LABEL[vote.support]}
            </span>
            <span className="mono gov-vote-row__w">
              {formatVotes(vote.weight, decimals)} {symbol}
            </span>
            {vote.reason ? <p className="gov-vote-row__reason">{vote.reason}</p> : null}
          </li>
        ))}
      </ul>
      {v.hasMore ? (
        <button type="button" className="link-btn" disabled={v.loadingMore} onClick={v.loadMore}>
          {v.loadingMore ? "Loading…" : "Show more votes"}
        </button>
      ) : null}
    </>
  );
}
