import { useId, useState } from "react";
import type { VoteEligibility, VoteSupport } from "@/features/governance";
import { cx } from "@/shared/lib/cx";
import { Notice } from "@/shared/ui/Notice";
import {
  AGAINST_ONLY_NOTICE,
  eligibilityNotice,
  formatVotes,
  SUPPORT_LABEL,
} from "../governance-copy";
import { Countdowns } from "./Countdowns";
import { type GovTxState, GovTxStatus } from "./GovTxStatus";

/// The longest reason the form accepts. The governor stores none of it, but
/// every character is calldata the voter pays for.
export const MAX_REASON = 1_000;

export interface VotePanelProps {
  /// Undefined while the live reads are loading.
  eligibility: VoteEligibility | undefined;
  /// The capability's sentence, for a session that cannot sign.
  signerReason?: string | undefined;
  now: number;
  voteStart: number;
  voteEnd: number;
  quorumVoteDeadline?: number | undefined;
  /// Votes at the snapshot.
  weight: bigint;
  decimals: number;
  symbol: string;
  onVote(support: VoteSupport, reason: string): void;
  tx: GovTxState;
}

/// Cast a vote, or be told why not.
export function VotePanel({
  eligibility,
  signerReason,
  now,
  voteStart,
  voteEnd,
  quorumVoteDeadline,
  weight,
  decimals,
  symbol,
  onVote,
  tx,
}: VotePanelProps) {
  const titleId = useId();
  const reasonId = useId();
  const [support, setSupport] = useState<VoteSupport | undefined>(undefined);
  const [reason, setReason] = useState("");

  const quorumVoteOpen = eligibility?.ok === true && eligibility.quorumVoteOpen;
  // A choice made while For was open does not survive its closing.
  const chosen = support !== undefined && (support === 0 || quorumVoteOpen) ? support : undefined;

  const body = (() => {
    if (tx.status !== "idle") {
      return (
        <GovTxStatus
          {...tx}
          pendingTitle="Casting your vote"
          doneTitle={chosen === undefined ? "Vote cast" : `Voted ${SUPPORT_LABEL[chosen]}`}
          failedTitle="Your vote did not go through"
          onRetry={tx.reset}
        />
      );
    }
    if (eligibility === undefined) return <p className="muted">Reading your voting power…</p>;
    if (!eligibility.ok) {
      const n = eligibilityNotice(eligibility, signerReason);
      return (
        <Notice tone={n.tone} title={n.title}>
          {n.body}
        </Notice>
      );
    }
    return (
      <form
        className="gov-vote"
        onSubmit={(e) => {
          e.preventDefault();
          if (chosen !== undefined) onVote(chosen, reason.trim());
        }}
      >
        {!eligibility.quorumVoteOpen ? (
          <Notice tone={AGAINST_ONLY_NOTICE.tone} title={AGAINST_ONLY_NOTICE.title}>
            {AGAINST_ONLY_NOTICE.body}
          </Notice>
        ) : null}
        <fieldset className="gov-vote__opts">
          <legend className="sr-only">Your vote</legend>
          {([1, 0, 2] as const).map((s) => {
            const disabled = s !== 0 && !eligibility.quorumVoteOpen;
            return (
              <label
                key={s}
                className={cx(
                  "gov-vote__opt",
                  `gov-vote__opt--${SUPPORT_LABEL[s].toLowerCase()}`,
                  chosen === s && "gov-vote__opt--on",
                  disabled && "gov-vote__opt--off",
                )}
              >
                <input
                  type="radio"
                  name="support"
                  className="input-hidden"
                  value={s}
                  checked={chosen === s}
                  disabled={disabled}
                  onChange={() => setSupport(s)}
                />
                {SUPPORT_LABEL[s]}
              </label>
            );
          })}
        </fieldset>
        <label className="gov-field" htmlFor={reasonId}>
          <span className="gov-field__lbl">Reason (optional, public)</span>
          <textarea
            id={reasonId}
            className="gov-input gov-input--area"
            rows={3}
            maxLength={MAX_REASON}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn--cta" disabled={chosen === undefined}>
          {chosen === undefined
            ? "Choose For, Against or Abstain"
            : `Vote ${SUPPORT_LABEL[chosen]} with ${formatVotes(weight, decimals)} ${symbol}`}
        </button>
      </form>
    );
  })();

  return (
    <section className="surface surface--card gov-card" aria-labelledby={titleId}>
      <h2 className="gov-card__t" id={titleId}>
        Vote
      </h2>
      <Countdowns
        now={now}
        voteStart={voteStart}
        voteEnd={voteEnd}
        quorumVoteDeadline={quorumVoteDeadline}
      />
      {body}
    </section>
  );
}
