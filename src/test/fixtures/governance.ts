// protocol-webserver's governance responses, as `/v1/governance/*` serves them.

export const PROPOSER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export const summaryRow = (over: Record<string, unknown> = {}) => ({
  proposalId: "1234567890123456789012345678901234567890",
  proposer: PROPOSER,
  title: "Raise the burn share",
  voteStart: 1_000,
  voteEnd: 1_300,
  quorumVoteDeadline: 1_240,
  createdBlock: 42,
  createdTx: `0x${"aa".repeat(32)}`,
  tallies: { for: "3000000000000000000", against: "1000000000000000000", abstain: "0" },
  voteCount: 2,
  ...over,
});

export const detailRow = (over: Record<string, unknown> = {}) => ({
  ...summaryRow(),
  description: "# Raise the burn share\n\nFrom 50% to 60%.",
  actions: [
    {
      target: "0x6666666666666666666666666666666666666666",
      value: "0",
      signature: "",
      calldata: "0x5c19a95c0000000000000000000000007777777777777777777777777777777777777777",
    },
  ],
  ...over,
});

export const voteRow = (over: Record<string, unknown> = {}) => ({
  voter: PROPOSER,
  support: 1,
  weight: "3000000000000000000",
  reason: "",
  blockNumber: 43,
  txHash: `0x${"bb".repeat(32)}`,
  ...over,
});
