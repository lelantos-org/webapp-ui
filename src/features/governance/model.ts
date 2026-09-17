import type { Tallies } from "./client";

/// `IGovernor.ProposalState`, in the contract's order.
export const PROPOSAL_STATES = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
] as const;

/// A governor proposal state name.
export type ProposalState = (typeof PROPOSAL_STATES)[number];

/// The contract's `uint8` state, or `undefined` for an unknown value.
export function proposalStateOf(raw: number): ProposalState | undefined {
  return PROPOSAL_STATES[raw];
}

/// Where a proposal sits in its voting window by the clock alone: `against` means only Against is accepted.
export type Phase = "upcoming" | "open" | "against" | "closed";

/// A proposal's voting bounds, in seconds.
export interface VotingWindow {
  voteStart: number;
  voteEnd: number;
  quorumVoteDeadline?: number | undefined;
}

/// The window phase at `nowSec`. OZ bounds: opens after `voteStart`, accepts at `voteEnd` and `quorumVoteDeadline`.
export function windowPhase(w: VotingWindow, nowSec: number): Phase {
  if (nowSec <= w.voteStart) return "upcoming";
  if (nowSec > w.voteEnd) return "closed";
  if (w.quorumVoteDeadline !== undefined && nowSec > w.quorumVoteDeadline) return "against";
  return "open";
}

/// The phase to show beside a state: the calendar's, but only while the governor says the proposal is live.
export function votingPhase(
  state: ProposalState | undefined,
  w: VotingWindow,
  nowSec: number,
): Phase | undefined {
  if (state === "Pending") return "upcoming";
  if (state !== "Active") return undefined;
  const p = windowPhase(w, nowSec);
  if (p === "upcoming") return "open";
  if (p === "closed") return w.quorumVoteDeadline !== undefined ? "against" : "open";
  return p;
}

/// A proposal's voting window: the governor's live figures where read, else the index's.
export function proposalWindow(
  indexed: VotingWindow | undefined,
  live: { snapshot: bigint; deadline: bigint; quorumVoteDeadline: bigint | undefined } | undefined,
): VotingWindow {
  return {
    voteStart: live ? Number(live.snapshot) : (indexed?.voteStart ?? 0),
    voteEnd: live ? Number(live.deadline) : (indexed?.voteEnd ?? 0),
    quorumVoteDeadline:
      live?.quorumVoteDeadline !== undefined
        ? Number(live.quorumVoteDeadline)
        : indexed?.quorumVoteDeadline,
  };
}

function bps(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 10_000n) / whole);
}

/// A proposal's tallies laid out on one bar, with the quorum marker.
export interface TallyBar {
  total: bigint;
  /// For + Abstain: what counts toward quorum.
  quorumVotes: bigint;
  quorumReached: boolean | undefined;
  /// For > Against — the second half of passing.
  forLeads: boolean;
  /// Segment widths in basis points, For then Abstain then Against.
  forBps: number;
  abstainBps: number;
  againstBps: number;
  /// Quorum line position in basis points; undefined when the quorum is unknown.
  quorumBps: number | undefined;
}

/// Lay the tallies and quorum out on one bar scaled to the larger of votes cast and quorum.
export function tallyBar(t: Tallies, quorum: bigint | undefined): TallyBar {
  const total = t.for + t.against + t.abstain;
  const quorumVotes = t.for + t.abstain;
  const scale = quorum !== undefined && quorum > total ? quorum : total;
  return {
    total,
    quorumVotes,
    quorumReached: quorum === undefined ? undefined : quorumVotes >= quorum,
    forLeads: t.for > t.against,
    forBps: bps(t.for, scale),
    abstainBps: bps(t.abstain, scale),
    againstBps: bps(t.against, scale),
    quorumBps: quorum === undefined || quorum === 0n ? undefined : bps(quorum, scale),
  };
}

/// Share of the votes cast, in basis points.
export function shareBps(part: bigint, total: bigint): number {
  return bps(part, total);
}

/// The longest title the indexer keeps, and so the longest a new proposal is given.
export const PROPOSAL_TITLE_MAX = 200;

/// The proposal's title: first non-empty description line, `#`s stripped, capped. Matches the indexer.
export function proposalTitle(description: string): string {
  for (const line of description.split(/\r?\n/)) {
    const t = line.replace(/^[\s#]+/, "").trim();
    if (t) return t.slice(0, PROPOSAL_TITLE_MAX);
  }
  return "";
}

/// The description after its title line. Attacker-controlled: render as plain text only.
export function proposalBody(description: string): string {
  const lines = description.split(/\r?\n/);
  const at = lines.findIndex((l) => l.replace(/^[\s#]+/, "").trim() !== "");
  if (at === -1) return "";
  return lines
    .slice(at + 1)
    .join("\n")
    .trim();
}

/// What `propose` is given: a markdown heading, a blank line, the body.
export function composeDescription(title: string, body: string): string {
  const t = title.trim();
  const b = body.trim();
  return b ? `# ${t}\n\n${b}` : `# ${t}`;
}

const ZERO = /^0x0{40}$/i;

/// `a` is absent or the zero address.
export function isZeroAddress(a: string | undefined): boolean {
  return a === undefined || ZERO.test(a);
}

/// Inputs to `voteEligibility`.
export interface VoteEligibilityInput {
  /// The session can send an EVM transaction (an injected wallet).
  canSign: boolean;
  state: ProposalState | undefined;
  phase: Phase | undefined;
  hasVoted: boolean;
  /// `getVotes(account, snapshot)` on the governor.
  votesAtSnapshot: bigint;
  /// The account's delegate now; the zero address when it has never delegated.
  delegate: string | undefined;
  /// The account's voting power now.
  currentVotes: bigint;
}

/// Whether an account may vote, or the reason it may not.
export type VoteEligibility =
  /// Eligible. `quorumVoteOpen` false means only Against is still accepted.
  | { ok: true; quorumVoteOpen: boolean }
  | {
      ok: false;
      reason:
        | "no-signer"
        | "not-active"
        | "already-voted"
        | "not-delegated"
        | "delegated-after-snapshot"
        | "no-votes";
    };

/// Whether this account can vote on this proposal, else the most actionable reason it cannot.
export function voteEligibility(i: VoteEligibilityInput): VoteEligibility {
  if (!i.canSign) return { ok: false, reason: "no-signer" };
  if (i.state !== "Active" || i.phase === "closed" || i.phase === "upcoming") {
    return { ok: false, reason: "not-active" };
  }
  if (i.hasVoted) return { ok: false, reason: "already-voted" };
  if (i.votesAtSnapshot === 0n) {
    if (isZeroAddress(i.delegate)) return { ok: false, reason: "not-delegated" };
    if (i.currentVotes > 0n) return { ok: false, reason: "delegated-after-snapshot" };
    return { ok: false, reason: "no-votes" };
  }
  return { ok: true, quorumVoteOpen: i.phase !== "against" };
}

/// Whether the account's votes at `clock() - 1` meet the proposal threshold.
export function canPropose(votes: bigint, threshold: bigint): boolean {
  return votes >= threshold;
}
