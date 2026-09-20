// Hand-kept governance ABI slices (quorum-vote items not yet in `@lelantos-org/contracts`); swap for the package once it ships.

/// What the app reads from and sends to `LelantosGovernor`, and the errors it can explain.
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

/// `MASP`: the pool, owned by the timelock. Includes the proxy's reserved
/// admin surface, which the proxy answers itself and which the timelock holds
/// alongside ownership.
export const poolActionAbi = [
  {
    type: "function",
    name: "addAsset",
    inputs: [
      { name: "id", type: "uint64" },
      { name: "token", type: "address" },
      { name: "scale", type: "uint256" },
      { name: "depositBps", type: "uint16" },
      { name: "withdrawBps", type: "uint16" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addYieldAsset",
    inputs: [
      { name: "id", type: "uint64" },
      { name: "token", type: "address" },
      { name: "scale", type: "uint256" },
      { name: "depositBps", type: "uint16" },
      { name: "withdrawBps", type: "uint16" },
      { name: "venue_", type: "address" },
      { name: "bufferBps_", type: "uint16" },
      { name: "perfBps_", type: "uint16" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setAssetFee",
    inputs: [
      { name: "id", type: "uint64" },
      { name: "depositBps", type: "uint16" },
      { name: "withdrawBps", type: "uint16" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setAssetDisabled",
    inputs: [
      { name: "id", type: "uint64" },
      { name: "disabled", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setYieldParams",
    inputs: [
      { name: "id", type: "uint64" },
      { name: "bufferBps", type: "uint16" },
      { name: "perfBps", type: "uint16" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setHalted",
    inputs: [
      { name: "id", type: "uint64" },
      { name: "halted", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "emergencyUnwind",
    inputs: [{ name: "id", type: "uint64" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setCancelDelay",
    inputs: [{ name: "newDelay", type: "uint32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setTreasury",
    inputs: [{ name: "newTreasury", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "queueUpgrade",
    inputs: [{ name: "newImplementation", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancelUpgrade",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pauseSpends",
    inputs: [{ name: "duration", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "queueVerifierUpdate",
    inputs: [
      { name: "treeUpdateBatchVerifier", type: "address" },
      { name: "spendVerifier", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancelVerifierUpdate",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/// `SwapWrapper`: the swap escrow, owned by the timelock.
export const swapWrapperActionAbi = [
  {
    type: "function",
    name: "setAdapterAllowed",
    inputs: [
      { name: "adapter", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setTreasury",
    inputs: [{ name: "t", type: "address" }],
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
