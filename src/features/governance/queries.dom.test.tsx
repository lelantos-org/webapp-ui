import { evmAddress } from "@lelantos-org/sdk";
import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAppHook } from "@/test/app";
import { detailRow, summaryRow, voteRow } from "@/test/fixtures/governance";
import { stubFetch, stubFetchRoutes } from "@/test/http";
import {
  useGovernance,
  useNowSeconds,
  useProposal,
  useProposalList,
  useProposalVotes,
  useVotingPower,
} from "./queries";

const GOVERNOR = "0x5555555555555555555555555555555555555555";
const TOKEN = "0x6666666666666666666666666666666666666666";
const ME = "0x1111111111111111111111111111111111111111";

const GOVERNED = { governorAddress: evmAddress(GOVERNOR), govTokenAddress: evmAddress(TOKEN) };
const CONNECTED = { chain: GOVERNED, wallet: { ethAddress: ME } } as const;
const UNGOVERNED = { chain: {}, wallet: { ethAddress: ME } } as const;
const NO_ACCOUNT = { chain: GOVERNED } as const;

const readContract = vi.fn();

vi.mock("./onchain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./onchain")>()),
  governanceClient: () => ({ readContract }),
}));

function answer(c: { functionName: string; args?: readonly unknown[] }) {
  switch (c.functionName) {
    case "state":
      return 1;
    case "quorum":
      return 2_000_000_000_000_000_000n;
    case "proposalVotes":
      return [1n, 2n, 3n];
    case "proposalSnapshot":
      return 1_000n;
    case "proposalDeadline":
      return 1_300n;
    case "proposalQuorumVoteDeadline":
      return 1_240n;
    case "clock":
      return 1_100;
    case "hasVoted":
      return true;
    case "getVotes":
      return 9n;
    case "symbol":
      return "LNT";
    case "decimals":
      return 18;
    case "balanceOf":
      return 10n;
    case "delegates":
      return ME;
    case "proposalThreshold":
      return 1n;
    default:
      throw new Error(`unexpected ${c.functionName}`);
  }
}

beforeEach(() => {
  readContract.mockReset();
  readContract.mockImplementation(async (c) => answer(c));
});
afterEach(() => vi.useRealTimers());

describe("useGovernance", () => {
  it("names the governor and the EVM account", () => {
    const { result } = renderAppHook(() => useGovernance(), CONNECTED);
    expect(result.current.governor).toBe(GOVERNOR);
    expect(result.current.account).toBe(evmAddress(ME));
  });
});

describe("useProposalList", () => {
  it("joins the indexed pages with each proposal's on-chain state", async () => {
    stubFetchRoutes({
      "/registry/v1/governance/proposals": {
        proposals: [summaryRow({ proposalId: "1" }), summaryRow({ proposalId: "2" })],
      },
    });
    const { result } = renderAppHook(() => useProposalList(), CONNECTED);
    await waitFor(() => expect(result.current.items[1]?.chain).toBeDefined());
    expect(result.current.items.map((p) => p.id)).toEqual(["1", "2"]);
    expect(result.current.items[0]?.chain).toEqual({
      state: "Active",
      quorum: 2_000_000_000_000_000_000n,
    });
    expect(result.current.hasMore).toBe(false);
  });

  it("fetches nothing on a chain without a governor", () => {
    const fetchMock = stubFetchRoutes({});
    const { result } = renderAppHook(() => useProposalList(), UNGOVERNED);
    expect(result.current.items).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the next page on request", async () => {
    let calls = 0;
    stubFetch(() =>
      ++calls === 1
        ? { proposals: [summaryRow({ proposalId: "2" })], nextCursor: "c" }
        : { proposals: [summaryRow({ proposalId: "1" })] },
    );
    const { result } = renderAppHook(() => useProposalList(), CONNECTED);
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
  });
});

describe("useProposal", () => {
  it("reads the indexed detail and the live figures for the account", async () => {
    stubFetchRoutes({ "/registry/v1/governance/proposals/7": detailRow() });
    const { result } = renderAppHook(() => useProposal("7"), CONNECTED);
    await waitFor(() => expect(result.current.live.data).toBeDefined());
    await waitFor(() => expect(result.current.detail.data).toBeDefined());
    expect(result.current.live.data?.account).toEqual({ hasVoted: true, votesAtSnapshot: 9n });
    expect(result.current.detail.data?.actions).toHaveLength(1);
  });

  it("does not read the chain for an id that is not a number", () => {
    stubFetchRoutes({});
    renderAppHook(() => useProposal("abc"), CONNECTED);
    expect(readContract).not.toHaveBeenCalled();
  });
});

describe("useProposalVotes", () => {
  it("pages through the indexed votes", async () => {
    stubFetchRoutes({ "/registry/v1/governance/proposals/7/votes": { votes: [voteRow()] } });
    const { result } = renderAppHook(() => useProposalVotes("7"), CONNECTED);
    await waitFor(() => expect(result.current.votes).toHaveLength(1));
    expect(result.current.hasMore).toBe(false);
  });
});

describe("useVotingPower", () => {
  it("reads the account's LNT and votes", async () => {
    const { result } = renderAppHook(() => useVotingPower(), CONNECTED);
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toMatchObject({ token: TOKEN, balance: 10n, votes: 9n });
  });

  it("stays idle without an EVM account", () => {
    const { result } = renderAppHook(() => useVotingPower(), NO_ACCOUNT);
    expect(result.current.fetchStatus).toBe("idle");
    expect(readContract).not.toHaveBeenCalled();
  });
});

describe("useNowSeconds", () => {
  it("ticks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { result } = renderAppHook(() => useNowSeconds(1_000), UNGOVERNED);
    expect(result.current).toBe(10);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe(12);
  });

  it("follows the governor's clock when it disagrees with the browser's", async () => {
    vi.setSystemTime(10_000);
    readContract.mockImplementation((c: { functionName: string }) =>
      c.functionName === "clock" ? 250 : answer(c),
    );
    const { result } = renderAppHook(() => useNowSeconds(1_000), CONNECTED);
    // The chain is 240s ahead; voting windows close on the chain's time, not the browser's.
    await waitFor(() => expect(result.current).toBe(250));
  });
});
