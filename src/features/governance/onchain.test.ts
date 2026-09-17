import { evmAddress } from "@lelantos-org/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  type GovReader,
  governanceClient,
  readListChain,
  readProposalChain,
  readVotingPower,
  resolveToken,
} from "./onchain";

const GOVERNOR = evmAddress("0x5555555555555555555555555555555555555555");
const TOKEN = evmAddress("0x6666666666666666666666666666666666666666");
const ME = evmAddress("0x1111111111111111111111111111111111111111");

type Call = { functionName: string; args?: readonly unknown[]; address: string };

/// A reader answering from a table of function names; a function returning an
/// Error makes that read revert.
function reader(answers: Record<string, (args: readonly unknown[]) => unknown>) {
  const readContract = vi.fn(async (c: Call) => {
    const answer = answers[c.functionName];
    if (!answer) throw new Error(`unexpected read ${c.functionName}`);
    const v = answer(c.args ?? []);
    if (v instanceof Error) throw v;
    return v;
  });
  return { client: { readContract } as unknown as GovReader, readContract };
}

describe("readListChain", () => {
  it("reads state for every proposal and quorum only once the snapshot has passed", async () => {
    const { client, readContract } = reader({
      state: ([id]) => (id === 1n ? 1 : new Error("GovernorNonexistentProposal")),
      quorum: () => 40n,
      // The governor's clock decides, not the browser's.
      clock: () => 500,
    });
    const out = await readListChain(client, GOVERNOR, [
      { id: "1", voteStart: 100 },
      { id: "2", voteStart: 900 },
    ]);
    expect(out.get("1")).toEqual({ state: "Active", quorum: 40n });
    // An id the governor does not know yet, and a snapshot still in the future.
    expect(out.get("2")).toEqual({ state: undefined, quorum: undefined });
    const quorumCalls = readContract.mock.calls.filter(([c]) => c.functionName === "quorum");
    expect(quorumCalls).toHaveLength(1);
  });
});

describe("readProposalChain", () => {
  const answers = {
    state: () => 1,
    proposalVotes: () => [5n, 20n, 3n] as const,
    proposalSnapshot: () => 100n,
    proposalDeadline: () => 400n,
    proposalQuorumVoteDeadline: () => 340n,
    clock: () => 200,
    quorum: () => 10n,
    hasVoted: () => false,
    getVotes: () => 7n,
  };

  it("maps OZ's (against, for, abstain) order onto named tallies", async () => {
    const { client } = reader(answers);
    const r = await readProposalChain(client, GOVERNOR, "9", ME);
    expect(r.tallies).toEqual({ for: 20n, against: 5n, abstain: 3n });
    expect(r).toMatchObject({
      state: "Active",
      quorumVoteDeadline: 340n,
      quorum: 10n,
      clock: 200n,
      account: { hasVoted: false, votesAtSnapshot: 7n },
    });
  });

  it("reads no account figures without an account", async () => {
    const { client, readContract } = reader(answers);
    const r = await readProposalChain(client, GOVERNOR, "9", undefined);
    expect(r.account).toBeUndefined();
    expect(readContract.mock.calls.map(([c]) => c.functionName)).not.toContain("hasVoted");
  });

  it("skips snapshot reads before the snapshot, and tolerates a governor with no quorum-vote window", async () => {
    const { client } = reader({
      ...answers,
      clock: () => 50,
      proposalQuorumVoteDeadline: () => new Error("no such function"),
    });
    const r = await readProposalChain(client, GOVERNOR, "9", ME);
    expect(r.quorum).toBeUndefined();
    expect(r.quorumVoteDeadline).toBeUndefined();
    expect(r.account).toEqual({ hasVoted: false, votesAtSnapshot: 0n });
  });
});

describe("voting power", () => {
  const answers = {
    symbol: () => "LNT",
    decimals: () => 18,
    balanceOf: () => 50n,
    delegates: () => ME,
    getVotes: (args: readonly unknown[]) => (args.length === 1 ? 50n : 45n),
    proposalThreshold: () => 10n,
    clock: () => 1_000,
    token: () => TOKEN,
  };

  it("reads the account's balance, delegate, votes and past votes", async () => {
    const { client, readContract } = reader(answers);
    const p = await readVotingPower(client, GOVERNOR, TOKEN, ME);
    expect(p).toEqual({
      token: TOKEN,
      symbol: "LNT",
      decimals: 18,
      balance: 50n,
      delegate: ME,
      votes: 50n,
      proposeVotes: 45n,
      threshold: 10n,
    });
    // `propose` checks clock() - 1.
    const past = readContract.mock.calls.find(
      ([c]) => c.functionName === "getVotes" && c.address === GOVERNOR,
    );
    expect(past?.[0].args).toEqual([ME, 999n]);
  });

  it("falls back to LNT/18 when the token will not say", async () => {
    const { client } = reader({
      ...answers,
      symbol: () => new Error("x"),
      decimals: () => new Error("x"),
      clock: () => 0,
    });
    const p = await readVotingPower(client, GOVERNOR, TOKEN, ME);
    expect(p.symbol).toBe("LNT");
    expect(p.decimals).toBe(18);
    expect(p.proposeVotes).toBe(0n);
  });

  it("takes the registry's token, else asks the governor", async () => {
    const { client, readContract } = reader(answers);
    expect(await resolveToken(client, { governorAddress: GOVERNOR, govTokenAddress: TOKEN })).toBe(
      TOKEN,
    );
    expect(readContract).not.toHaveBeenCalled();
    expect(await resolveToken(client, { governorAddress: GOVERNOR })).toBe(TOKEN);
    expect(await resolveToken(client, {})).toBeUndefined();
  });
});

describe("governanceClient", () => {
  it("shares one client per read endpoint", () => {
    const a = governanceClient({ readRpcUrl: "http://localhost:8545" });
    expect(governanceClient({ readRpcUrl: "http://localhost:8545" })).toBe(a);
    expect(governanceClient({ readRpcUrl: "http://localhost:9545" })).not.toBe(a);
  });
});
