// What a proposal's figures mean: its state, where it is in its voting window,
// how close it is to quorum, and whether this account can vote on it and why
// not. Pure, so every rule is testable against literal numbers.
//
// The rules mirror `LelantosGovernor` — OZ Governor with GovernorCountingSimple
// plus a quorum-vote window:
//
//   - Votes are 0 Against, 1 For, 2 Abstain, weighted at the proposal snapshot.
//   - Quorum counts For + Abstain; Against never helps reach it.
//   - A proposal succeeds when quorum is reached and For > Against.
//   - For and Abstain — the quorum votes — close at `quorumVoteDeadline`;
//     Against stays open until `voteEnd`. The asymmetry stops a late For from
//     passing a proposal with no time left to answer it.

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

export type ProposalState = (typeof PROPOSAL_STATES)[number];

/// The contract's `uint8` state, or `undefined` for a value the enum does not
/// have (a newer governor).
export function proposalStateOf(raw: number): ProposalState | undefined {
  return PROPOSAL_STATES[raw];
}

/// Where a proposal sits in its voting window, from the clock alone.
///
/// - `upcoming`   before `voteStart`.
/// - `open`       every option is open.
/// - `against`    past `quorumVoteDeadline`: only Against is still accepted.
/// - `closed`     past `voteEnd`.
///
/// State and phase are different questions. State is the governor's verdict and
/// covers cancellation and execution; phase is only the calendar, so a canceled
/// proposal still has one. Callers combine them — see `votingPhase`.
export type Phase = "upcoming" | "open" | "against" | "closed";

export interface VotingWindow {
  voteStart: number;
  voteEnd: number;
  quorumVoteDeadline?: number | undefined;
}

/// The governor's clock is `block.timestamp`, and OZ treats both bounds as
/// inclusive: voting opens *after* `voteStart` and is accepted *at* `voteEnd`;
/// For/Abstain are accepted at `quorumVoteDeadline` and refused one second later.
export function windowPhase(w: VotingWindow, nowSec: number): Phase {
  if (nowSec <= w.voteStart) return "upcoming";
  if (nowSec > w.voteEnd) return "closed";
  if (w.quorumVoteDeadline !== undefined && nowSec > w.quorumVoteDeadline) return "against";
  return "open";
}

/// The phase to show beside a state: the calendar's, but only while the
/// governor agrees the proposal is live. A canceled proposal inside its window
/// is not "open"; an `Active` state a second after `voteEnd` (the read raced the
/// block) is shown as still open, since the chain has not closed it yet.
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

/// A proposal's voting window: the governor's own figures where they have been
/// read, the index's until then. The chain is the authority — the index can lag
/// a block, or predate the event that carries `quorumVoteDeadline`.
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

/// Basis points of `part` in `whole`, floored; 0 when `whole` is 0.
function bps(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 10_000n) / whole);
}

export interface TallyBar {
  total: bigint;
  /// For + Abstain: what counts toward quorum.
  quorumVotes: bigint;
  quorumReached: boolean | undefined;
  /// For > Against — the second half of passing.
  forLeads: boolean;
  /// Segment widths in basis points of the bar, For then Abstain then Against, so
  /// the quorum marker reads against the For + Abstain run that meets it.
  forBps: number;
  abstainBps: number;
  againstBps: number;
  /// Where the quorum line sits on the bar, in basis points; undefined when the
  /// quorum is not known (a proposal whose snapshot is still in the future).
  quorumBps: number | undefined;
}

/// Lay the three tallies and the quorum out on one bar.
///
/// The bar's scale is the larger of the votes cast and the quorum, so an empty
/// proposal shows its quorum line at the far end and a crowded one shows the
/// line inside the For + Abstain run it has passed.
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

// ── titles ──────────────────────────────────────────────────────────────────

/// The longest title the indexer keeps, and so the longest a new proposal is given.
export const PROPOSAL_TITLE_MAX = 200;

/// The proposal's title: the first non-empty line of its description with any
/// leading `#`s and whitespace removed, capped at 200 characters. The same rule
/// the indexer applies, so a title read here and one served agree.
export function proposalTitle(description: string): string {
  for (const line of description.split(/\r?\n/)) {
    const t = line.replace(/^[\s#]+/, "").trim();
    if (t) return t.slice(0, PROPOSAL_TITLE_MAX);
  }
  return "";
}

/// The description after its title line, trimmed. Rendered as plain text only:
/// anyone can propose, so this is attacker-controlled.
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

// ── who can vote ────────────────────────────────────────────────────────────

const ZERO = /^0x0{40}$/i;

export function isZeroAddress(a: string | undefined): boolean {
  return a === undefined || ZERO.test(a);
}

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

/// Whether this account can vote on this proposal, and if not, the one reason
/// that matters most.
///
/// Ordered by what the user can act on. A passkey session cannot sign at all, so
/// nothing else is worth saying; a closed proposal makes weight irrelevant;
/// having voted already is final. Only then does weight come in, and zero weight
/// is split three ways because each has a different fix — delegate, wait for the
/// next proposal, or acquire LNT.
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

/// Whether the account can create a proposal: its votes one second in the past
/// (the governor reads `clock() - 1`) meet the threshold.
export function canPropose(votes: bigint, threshold: bigint): boolean {
  return votes >= threshold;
}
