// Every sentence the governance screens say, and the small formatting they share.
//
// Kept apart from the components so the words can be read, and tested, in one
// place — above all the reasons someone cannot vote, which each point at a
// different fix.

import type {
  GovErrorCode,
  Phase,
  ProposalState,
  VoteEligibility,
  VoteSupport,
} from "@/features/governance";
import { formatDecimalCompact } from "@/shared/lib/format/number";

export const SUPPORT_LABEL: Record<VoteSupport, string> = {
  0: "Against",
  1: "For",
  2: "Abstain",
};

export function stateLabel(state: ProposalState | undefined): string {
  return state ?? "Unknown";
}

export type StateTone = "accent" | "warn" | "err" | "neutral" | "ok";

/// Colour of a state badge: live votes in the accent, outcomes that pass in the
/// success tone, those that failed in err, and the rest neutral.
export function stateTone(state: ProposalState | undefined): StateTone {
  switch (state) {
    case "Active":
      return "accent";
    case "Pending":
    case "Queued":
      return "warn";
    case "Succeeded":
    case "Executed":
      return "ok";
    case "Defeated":
    case "Expired":
      return "err";
    default:
      return "neutral";
  }
}

/// A duration as its two largest units: "2d 4h", "5m 12s", "40s".
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/// The one line a list row says about where a proposal is in its window.
export function phaseLine(
  phase: Phase | undefined,
  w: { voteStart: number; voteEnd: number; quorumVoteDeadline?: number | undefined },
  now: number,
): string | undefined {
  switch (phase) {
    case "upcoming":
      return `Voting opens in ${formatDuration(w.voteStart - now)}`;
    case "open":
      return w.quorumVoteDeadline !== undefined
        ? `For/Abstain close in ${formatDuration(w.quorumVoteDeadline - now)}`
        : `Voting closes in ${formatDuration(w.voteEnd - now)}`;
    case "against":
      return `Against-only window · closes in ${formatDuration(w.voteEnd - now)}`;
    default:
      return undefined;
  }
}

/// A token amount for a tally or a balance: at most two fractional digits.
export function formatVotes(amount: bigint, decimals: number): string {
  return formatDecimalCompact(amount, decimals, 2);
}

/// A share in basis points as a percentage, trailing zeros dropped: "12.5%",
/// "50%". Unlike the shared `formatBps`, whose fixed precision states how a rate
/// was configured, this is a proportion of the votes cast.
export function formatShare(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

export interface NoticeCopy {
  tone: "warn" | "neutral" | "err";
  title: string;
  body: string;
}

/// Why this account cannot vote, in terms of what to do about it.
export function eligibilityNotice(
  e: Extract<VoteEligibility, { ok: false }>,
  signerReason?: string,
): NoticeCopy {
  switch (e.reason) {
    case "no-signer":
      return {
        tone: "neutral",
        title: "Read-only session",
        body:
          signerReason ??
          "Voting is a transaction from a public account. Connect a browser wallet holding LNT to vote.",
      };
    case "not-active":
      return {
        tone: "neutral",
        title: "Voting is not open",
        body: "Votes are only accepted while a proposal is active.",
      };
    case "already-voted":
      return {
        tone: "neutral",
        title: "You have voted",
        body: "The governor counts one vote per account, and a vote cannot be changed.",
      };
    case "not-delegated":
      return {
        tone: "warn",
        title: "You have no votes on this proposal",
        body: "LNT carries no votes until it is delegated — to yourself or to someone else. Delegating now counts only for proposals created afterwards.",
      };
    case "delegated-after-snapshot":
      return {
        tone: "warn",
        title: "Your delegation came after this proposal",
        body: "Votes are weighed at the proposal's snapshot, and you had none then. Your current voting power will count on proposals created from now on.",
      };
    case "no-votes":
      return {
        tone: "neutral",
        title: "You had no votes at the snapshot",
        body: "Only transparent LNT delegated before the proposal was created counts. Shielded LNT carries no votes.",
      };
  }
}

export const AGAINST_ONLY_NOTICE: NoticeCopy = {
  tone: "warn",
  title: "Only Against is still open",
  body: "For and Abstain close before voting ends, so a late vote cannot pass a proposal with no time left to answer it. Against stays open until voting closes.",
};

export const DELEGATE_NOTICES = {
  shielded: "Only transparent LNT votes. LNT inside the shielded pool carries no voting power.",
  timing:
    "Delegation counts only for proposals created after it: votes are weighed at each proposal's snapshot.",
};

export const DESCRIPTION_NOTE =
  "Written by the proposer and shown as plain text. Check the actions below — they are what executes.";

/// What a refused governance transaction means, where the governor said why.
export function governanceErrorText(code: GovErrorCode | undefined): string | undefined {
  switch (code) {
    case "quorum-vote-closed":
      return "For and Abstain have closed on this proposal. Only Against is still accepted.";
    case "already-voted":
      return "This account has already voted on this proposal.";
    case "not-active":
      return "This proposal is no longer open for voting.";
    case "below-threshold":
      return "This account's voting power is below the proposal threshold.";
    case "unknown-proposal":
      return "The governor does not know this proposal.";
    case "bad-proposal":
      return "The proposal's actions are malformed: each needs a target, a value and calldata.";
    case "restricted-proposer":
      return "The description restricts who may submit this proposal.";
    case "reverted":
      return "The transaction was mined but reverted.";
    default:
      return undefined;
  }
}
