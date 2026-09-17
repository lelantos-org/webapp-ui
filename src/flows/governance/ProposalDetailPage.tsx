import { useParams } from "react-router-dom";
import {
  GovernanceNotFound,
  isProposalId,
  proposalBody,
  proposalWindow,
  useCastVote,
  useGovernance,
  useNowSeconds,
  useProposal,
  useVotingPower,
  type VoteSupport,
  voteEligibility,
  votingPhase,
} from "@/features/governance";
import { useWallet } from "@/features/wallet";
import { shortAddr } from "@/shared/lib/address";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { ActionsList } from "./components/ActionsList";
import { GovernorGate } from "./components/GovernorGate";
import { StateBadge } from "./components/StateBadge";
import { TallyBar } from "./components/TallyBar";
import { VotePanel } from "./components/VotePanel";
import { VotesList } from "./components/VotesList";
import { DESCRIPTION_NOTE } from "./governance-copy";
import { useGovTx } from "./use-gov-tx";
import "./governance.css";

/// `/governance/:id`.
export function ProposalDetailPage() {
  const { id = "" } = useParams();
  return (
    <GovernorGate>
      <ProposalDetail id={id} />
    </GovernorGate>
  );
}

function ProposalDetail({ id }: { id: string }) {
  const { account } = useGovernance();
  const { capabilities } = useWallet();
  const { detail, live } = useProposal(id);
  const power = useVotingPower();
  const now = useNowSeconds();
  const vote = useCastVote(id);
  const { tx, onSent, begin } = useGovTx(vote);

  const d = detail.data;
  const l = live.data;
  const decimals = power.data?.decimals ?? 18;
  const symbol = power.data?.symbol ?? "LNT";

  if (detail.error instanceof GovernanceNotFound && (live.isError || !isProposalId(id))) {
    return (
      <>
        <ScreenHeader
          title="Proposal not found"
          backTo="/governance"
          backLabel="Back to proposals"
        />
        <Notice tone="neutral" title="Nothing lives at this id">
          The governor and the index both say this proposal does not exist on this network.
        </Notice>
      </>
    );
  }

  const win = proposalWindow(d, l);
  const phase = votingPhase(l?.state, win, now);
  const tallies = l?.tallies ?? d?.tallies;

  const loadingEligibility =
    !l || (capabilities.govern.allowed && account !== undefined && power.data === undefined);
  const eligibility = loadingEligibility
    ? capabilities.govern.allowed
      ? undefined
      : ({ ok: false, reason: "no-signer" } as const)
    : voteEligibility({
        canSign: capabilities.govern.allowed,
        state: l.state,
        phase,
        hasVoted: l.account?.hasVoted ?? false,
        votesAtSnapshot: l.account?.votesAtSnapshot ?? 0n,
        delegate: power.data?.delegate,
        currentVotes: power.data?.votes ?? 0n,
      });

  const cast = (support: VoteSupport, reason: string) => {
    begin();
    vote.mutate({ support, reason, onSent });
  };

  const title = d?.title || `Proposal ${shortAddr(id, 6)}`;
  const body = d ? proposalBody(d.description) : "";

  return (
    <>
      <ScreenHeader
        title={title}
        subtitle={
          d ? (
            <span>
              Proposed by <span className="mono">{shortAddr(d.proposer, 4)}</span>
            </span>
          ) : undefined
        }
        backTo="/governance"
        backLabel="Back to proposals"
      />
      <div className="gov-detail">
        <div className="gov-detail__main">
          <section className="surface surface--card gov-card" aria-label="Result so far">
            <div className="gov-card__hdr">
              <StateBadge state={l?.state} phase={phase} />
            </div>
            {tallies ? (
              <TallyBar tallies={tallies} quorum={l?.quorum} decimals={decimals} symbol={symbol} />
            ) : (
              <p className="muted">Reading the tallies…</p>
            )}
          </section>

          <section className="surface surface--card gov-card" aria-label="Description">
            <h2 className="gov-card__t">Description</h2>
            {detail.isLoading ? (
              <p className="muted">Loading…</p>
            ) : detail.error ? (
              <p className="muted">
                The governance index has no description for this proposal yet.
              </p>
            ) : (
              <>
                {/* Plain text, never HTML: anyone can write a proposal. */}
                <p className="gov-desc">{body || "No description beyond the title."}</p>
                <p className="gov-note muted">{DESCRIPTION_NOTE}</p>
              </>
            )}
          </section>

          {d ? (
            <section className="surface surface--card gov-card" aria-label="Actions">
              <h2 className="gov-card__t">Actions</h2>
              <ActionsList actions={d.actions} />
            </section>
          ) : null}

          <section className="surface surface--card gov-card" aria-label="Votes">
            <h2 className="gov-card__t">Votes</h2>
            <VotesList proposalId={id} decimals={decimals} symbol={symbol} />
          </section>
        </div>

        <div className="gov-detail__side">
          {live.isError ? (
            <Notice tone="err" title="Could not read this proposal from the chain">
              Its state, tallies and your voting power come from the governor itself, and the
              network did not answer. Voting stays closed here until it does.
            </Notice>
          ) : null}
          <VotePanel
            eligibility={eligibility}
            signerReason={capabilities.govern.reason}
            now={now}
            voteStart={win.voteStart}
            voteEnd={win.voteEnd}
            quorumVoteDeadline={win.quorumVoteDeadline}
            weight={l?.account?.votesAtSnapshot ?? 0n}
            decimals={decimals}
            symbol={symbol}
            onVote={cast}
            tx={tx}
          />
        </div>
      </div>
    </>
  );
}
