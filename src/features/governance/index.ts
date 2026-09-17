// Public surface of the `governance` feature: LNT holders reading proposals,
// voting, delegating and proposing against `LelantosGovernor`.
//
//   `abi.ts`        the hand-kept governor and token ABI slices.
//   `client.ts`     protocol-webserver's governance index (proposals, votes).
//   `onchain.ts`    live reads — state, tallies, quorum, voting power.
//   `model.ts`      what the figures mean: phase, quorum bar, who may vote.
//   `actions.ts`    proposal actions decoded against known ABIs, and built.
//   `tx.ts`         sending a write from the browser wallet; decoding refusals.
//   `queries.ts`,
//   `mutations.ts`  the React bindings.

export type { BuiltAction, KnownContract } from "./actions";
export {
  buildAction,
  decodeAction,
  findFunction,
  functionSignature,
  knownContracts,
} from "./actions";
export type { ProposalDetail, Tallies, VoteSupport } from "./client";
export { GovernanceNotFound, isProposalId } from "./client";
export type { Phase, ProposalState, VoteEligibility } from "./model";
export {
  canPropose,
  composeDescription,
  isZeroAddress,
  PROPOSAL_TITLE_MAX,
  proposalBody,
  proposalWindow,
  shareBps,
  tallyBar,
  voteEligibility,
  votingPhase,
} from "./model";
export { useCastVote, useDelegate, usePropose } from "./mutations";
export type { ProposalListItem } from "./queries";
export {
  useGovernance,
  useNowSeconds,
  useProposal,
  useProposalList,
  useProposalVotes,
  useVotingPower,
} from "./queries";
export type { GovErrorCode } from "./tx";
export { governorErrorCode } from "./tx";
