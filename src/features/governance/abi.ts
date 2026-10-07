// Governance ABI slices, picked by name from `@lelantos-org/contracts`.
import { delayedUpgradeProxyAbi } from "@lelantos-org/contracts/DelayedUpgradeProxy";
import { feeBurnerAbi } from "@lelantos-org/contracts/FeeBurner";
import { lelantosGovernorAbi } from "@lelantos-org/contracts/LelantosGovernor";
import { lelantosTokenAbi } from "@lelantos-org/contracts/LelantosToken";
import { maspAbi } from "@lelantos-org/contracts/MASP";
import { swapWrapperAbi } from "@lelantos-org/contracts/SwapWrapper";
import type { Abi } from "viem";

type Named<A extends Abi> = Extract<A[number], { name: string }>;

/// The items of `abi` called one of `names`, in the order `names` lists them.
function pick<const A extends Abi, N extends Named<A>["name"]>(
  abi: A,
  names: readonly N[],
): Extract<Named<A>, { name: N }>[] {
  return names.flatMap((name) =>
    abi.filter((i): i is Extract<Named<A>, { name: N }> => "name" in i && i.name === name),
  );
}

/// What the app reads from and sends to `LelantosGovernor`, and the errors it can explain.
export const governorAbi = pick(lelantosGovernorAbi, [
  "state",
  "proposalVotes",
  "proposalSnapshot",
  "proposalDeadline",
  "quorum",
  "hasVoted",
  "getVotes",
  "proposalThreshold",
  "clock",
  "token",
  "castVoteWithReason",
  "propose",
  "ProposalCreated",
  "GovernorAlreadyCastVote",
  "GovernorUnexpectedProposalState",
  "GovernorNonexistentProposal",
  "GovernorInsufficientProposerVotes",
  "GovernorInvalidProposalLength",
  "GovernorRestrictedProposer",
  "GovernorInvalidVoteType",
  "GovernorOnlyExecutor",
  "quorumVoteCutoff",
  "proposalQuorumVoteDeadline",
  "ProposalQuorumVoteDeadline",
  "QuorumVoteCutoffSet",
  "QuorumVotingClosed",
  "InvalidQuorumVoteCutoff",
]);

/// What the app reads from and sends to `LelantosToken` (LNT).
export const govTokenAbi = pick(lelantosTokenAbi, [
  "balanceOf",
  "delegates",
  "getVotes",
  "decimals",
  "symbol",
  "delegate",
]);

/// Governor settings a proposal can change. Every one is `onlyGovernance`.
export const governorActionAbi = pick(lelantosGovernorAbi, [
  "setVotingDelay",
  "setVotingPeriod",
  "setProposalThreshold",
  "updateQuorumNumerator",
  "updateTimelock",
  "relay",
  "setQuorumVoteCutoff",
]);

/// Token calls a proposal can make with the treasury's LNT.
export const govTokenActionAbi = pick(lelantosTokenAbi, [
  "transfer",
  "approve",
  "delegate",
  "burn",
]);

/// `MASP`: the pool, owned by the timelock. Includes the proxy's reserved admin
/// functions, which the proxy answers itself and the timelock also holds.
export const poolActionAbi = [
  ...pick(maspAbi, [
    "addAsset",
    "addYieldAsset",
    "setAssetFee",
    "setAssetDisabled",
    "setYieldParams",
    "setHalted",
    "emergencyUnwind",
    "setCancelDelay",
    "setTreasury",
  ]),
  ...pick(delayedUpgradeProxyAbi, [
    "queueUpgrade",
    "cancelUpgrade",
    "pauseSpends",
    "queueVerifierUpdate",
    "cancelVerifierUpdate",
  ]),
];

/// `SwapWrapper`: the swap escrow, owned by the timelock.
export const swapWrapperActionAbi = pick(swapWrapperAbi, ["setAdapterAllowed", "setTreasury"]);

/// `FeeBurner`: the protocol-fee auction, owned by the timelock.
export const feeBurnerActionAbi = pick(feeBurnerAbi, [
  "setBurnBps",
  "setDecayParams",
  "setLot",
  "setPaused",
  "setPools",
  "setSecondaryTreasury",
  "rescue",
  "transferOwnership",
  "burnAccruedGov",
]);
