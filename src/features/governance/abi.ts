// The slices of the governance contracts this app calls, decodes or offers as
// proposal actions, as typed `as const` ABIs.
//
// Hand-kept rather than imported from `@lelantos-org/contracts`: the release
// carrying the governor's quorum-vote window is not published yet. Every entry is
// copied from `contracts/packages/abi/src/abis/` (LelantosGovernor,
// LelantosToken, ProtocolAdmin, FeeBurner), less `internalType`, except the
// quorum-vote items, which follow the governor change that adds them
// (`quorumVoteCutoff`, `proposalQuorumVoteDeadline`, `setQuorumVoteCutoff`,
// `ProposalQuorumVoteDeadline`, `QuorumVoteCutoffSet`, `QuorumVotingClosed`,
// `InvalidQuorumVoteCutoff`). Swap this file for the package once it ships.

/// What the app reads from and sends to `LelantosGovernor`, and the errors it
/// can explain.
export const governorAbi = [
  {
    type: "function",
    name: "state",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalVotes",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "againstVotes",
        type: "uint256",
      },
      {
        name: "forVotes",
        type: "uint256",
      },
      {
        name: "abstainVotes",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalSnapshot",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quorum",
    inputs: [
      {
        name: "timepoint",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasVoted",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVotes",
    inputs: [
      {
        name: "account",
        type: "address",
      },
      {
        name: "timepoint",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalThreshold",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "clock",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint48",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "castVoteWithReason",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "support",
        type: "uint8",
      },
      {
        name: "reason",
        type: "string",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "propose",
    inputs: [
      {
        name: "targets",
        type: "address[]",
      },
      {
        name: "values",
        type: "uint256[]",
      },
      {
        name: "calldatas",
        type: "bytes[]",
      },
      {
        name: "description",
        type: "string",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "ProposalCreated",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
        indexed: false,
      },
      {
        name: "proposer",
        type: "address",
        indexed: false,
      },
      {
        name: "targets",
        type: "address[]",
        indexed: false,
      },
      {
        name: "values",
        type: "uint256[]",
        indexed: false,
      },
      {
        name: "signatures",
        type: "string[]",
        indexed: false,
      },
      {
        name: "calldatas",
        type: "bytes[]",
        indexed: false,
      },
      {
        name: "voteStart",
        type: "uint256",
        indexed: false,
      },
      {
        name: "voteEnd",
        type: "uint256",
        indexed: false,
      },
      {
        name: "description",
        type: "string",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "GovernorAlreadyCastVote",
    inputs: [
      {
        name: "voter",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "GovernorUnexpectedProposalState",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "current",
        type: "uint8",
      },
      {
        name: "expectedStates",
        type: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "GovernorNonexistentProposal",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "GovernorInsufficientProposerVotes",
    inputs: [
      {
        name: "proposer",
        type: "address",
      },
      {
        name: "votes",
        type: "uint256",
      },
      {
        name: "threshold",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "GovernorInvalidProposalLength",
    inputs: [
      {
        name: "targets",
        type: "uint256",
      },
      {
        name: "calldatas",
        type: "uint256",
      },
      {
        name: "values",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "GovernorRestrictedProposer",
    inputs: [
      {
        name: "proposer",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "GovernorInvalidVoteType",
    inputs: [],
  },
  {
    type: "error",
    name: "GovernorOnlyExecutor",
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
  },
  {
    type: "function",
    name: "quorumVoteCutoff",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalQuorumVoteDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "ProposalQuorumVoteDeadline",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
        indexed: false,
      },
      {
        name: "quorumVoteDeadline",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "QuorumVoteCutoffSet",
    inputs: [
      {
        name: "oldQuorumVoteCutoff",
        type: "uint256",
        indexed: false,
      },
      {
        name: "newQuorumVoteCutoff",
        type: "uint256",
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "QuorumVotingClosed",
    inputs: [
      {
        name: "proposalId",
        type: "uint256",
      },
      {
        name: "quorumVoteDeadline",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidQuorumVoteCutoff",
    inputs: [
      {
        name: "quorumVoteCutoff",
        type: "uint256",
      },
      {
        name: "votingPeriod",
        type: "uint256",
      },
    ],
  },
] as const;

/// What the app reads from and sends to `LelantosToken` (LNT).
export const govTokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "delegates",
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVotes",
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "delegate",
    inputs: [
      {
        name: "delegatee",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/// Governor settings a proposal can change. Every one is `onlyGovernance`.
export const governorActionAbi = [
  {
    type: "function",
    name: "setVotingDelay",
    inputs: [
      {
        name: "newVotingDelay",
        type: "uint48",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setVotingPeriod",
    inputs: [
      {
        name: "newVotingPeriod",
        type: "uint32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setProposalThreshold",
    inputs: [
      {
        name: "newProposalThreshold",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateQuorumNumerator",
    inputs: [
      {
        name: "newQuorumNumerator",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateTimelock",
    inputs: [
      {
        name: "newTimelock",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "relay",
    inputs: [
      {
        name: "target",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "data",
        type: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "setQuorumVoteCutoff",
    inputs: [
      {
        name: "newQuorumVoteCutoff",
        type: "uint32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/// Token calls a proposal can make with the treasury's LNT.
export const govTokenActionAbi = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      {
        name: "to",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      {
        name: "spender",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "delegate",
    inputs: [
      {
        name: "delegatee",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "burn",
    inputs: [
      {
        name: "value",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/// `ProtocolAdmin`: the pool's admin, owned by the timelock.
export const protocolAdminActionAbi = [
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "target",
        type: "address",
      },
      {
        name: "data",
        type: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "migrateAdmin",
    inputs: [
      {
        name: "newAdmin",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "grantRole",
    inputs: [
      {
        name: "role",
        type: "bytes32",
      },
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeRole",
    inputs: [
      {
        name: "role",
        type: "bytes32",
      },
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "disableAsset",
    inputs: [
      {
        name: "id",
        type: "uint64",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "haltYield",
    inputs: [
      {
        name: "id",
        type: "uint64",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "emergencyUnwind",
    inputs: [
      {
        name: "id",
        type: "uint64",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pauseSpends",
    inputs: [
      {
        name: "duration",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "disallowAdapter",
    inputs: [
      {
        name: "adapter",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/// `FeeBurner`: the protocol-fee auction, owned by the timelock.
export const feeBurnerActionAbi = [
  {
    type: "function",
    name: "setBurnBps",
    inputs: [
      {
        name: "burnBps_",
        type: "uint16",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setDecayParams",
    inputs: [
      {
        name: "halfLife_",
        type: "uint32",
      },
      {
        name: "maxHalvings_",
        type: "uint8",
      },
      {
        name: "restartMultBps_",
        type: "uint16",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setLot",
    inputs: [
      {
        name: "token",
        type: "address",
      },
      {
        name: "enabled",
        type: "bool",
      },
      {
        name: "startPrice",
        type: "uint256",
      },
      {
        name: "minPrice",
        type: "uint256",
      },
      {
        name: "minLot",
        type: "uint128",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setPaused",
    inputs: [
      {
        name: "paused_",
        type: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setPools",
    inputs: [
      {
        name: "pools_",
        type: "address[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setSecondaryTreasury",
    inputs: [
      {
        name: "treasury_",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rescue",
    inputs: [
      {
        name: "token",
        type: "address",
      },
      {
        name: "to",
        type: "address",
      },
      {
        name: "amount",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "burnAccruedGov",
    inputs: [],
    outputs: [
      {
        name: "amount",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
] as const;
