import { afterEach, describe, expect, it, vi } from "vitest";
import { detailRow, summaryRow, voteRow } from "@/test/fixtures/governance";
import {
  fetchProposal,
  fetchProposals,
  fetchVotes,
  GovernanceNotFound,
  parseProposalDetail,
  parseProposalsPage,
  parseVotesPage,
} from "./client";

describe("parseProposalsPage", () => {
  it("reads uint256 figures exactly and keeps optional lifecycle fields absent", () => {
    const page = parseProposalsPage({ proposals: [summaryRow()], nextCursor: "c1" });
    expect(page.nextCursor).toBe("c1");
    const [p] = page.items;
    expect(p).toMatchObject({
      id: "1234567890123456789012345678901234567890",
      title: "Raise the burn share",
      quorumVoteDeadline: 1_240,
      tallies: {
        for: 3_000_000_000_000_000_000n,
        against: 1_000_000_000_000_000_000n,
        abstain: 0n,
      },
    });
    expect(p?.executedAtBlock).toBeUndefined();
  });

  it("drops a malformed row and keeps the rest", () => {
    const page = parseProposalsPage({
      proposals: [
        summaryRow({ tallies: { for: "1.5", against: "0", abstain: "0" } }),
        summaryRow(),
      ],
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeUndefined();
  });

  it("rejects a body of the wrong shape", () => {
    expect(() => parseProposalsPage({ items: [] })).toThrow();
  });
});

describe("parseProposalDetail", () => {
  it("reads the description and actions", () => {
    const d = parseProposalDetail(detailRow());
    expect(d.description).toContain("60%");
    expect(d.actions[0]).toMatchObject({ value: 0n, signature: "" });
  });

  it("rejects calldata that is not hex", () => {
    expect(() =>
      parseProposalDetail(
        detailRow({ actions: [{ target: "0x1", value: "0", signature: "", calldata: "zz" }] }),
      ),
    ).toThrow();
  });
});

describe("parseVotesPage", () => {
  it("reads weights exactly and rejects a support value outside 0..2", () => {
    const page = parseVotesPage({ votes: [voteRow(), voteRow({ support: 3 })], nextCursor: "n" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.weight).toBe(3_000_000_000_000_000_000n);
  });
});

describe("fetchers", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("asks for a chain's proposals with the cursor", async () => {
    const fetchMock = respond(200, { proposals: [summaryRow()] });
    vi.stubGlobal("fetch", fetchMock);
    const page = await fetchProposals("/registry", 31337n, "abc");
    expect(page.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/registry/v1/governance/proposals?chainId=31337&cursor=abc&limit=20",
      {},
    );
  });

  it("maps a 404 to GovernanceNotFound and anything else to an error", async () => {
    vi.stubGlobal("fetch", respond(404, {}));
    await expect(fetchProposal("/registry", 1n, "7")).rejects.toBeInstanceOf(GovernanceNotFound);
    vi.stubGlobal("fetch", respond(500, {}));
    await expect(fetchVotes("/registry", 1n, "7")).rejects.toThrow(/500/);
  });

  it("never puts a non-numeric id in a path", async () => {
    const fetchMock = respond(200, {});
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchProposal("/registry", 1n, "../chains")).rejects.toBeInstanceOf(
      GovernanceNotFound,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches one proposal and its votes", async () => {
    const signal = new AbortController().signal;
    const fetchMock = respond(200, detailRow());
    vi.stubGlobal("fetch", fetchMock);
    await fetchProposal("/registry", 1n, "7", signal);
    expect(fetchMock).toHaveBeenCalledWith("/registry/v1/governance/proposals/7?chainId=1", {
      signal,
    });
    vi.stubGlobal("fetch", respond(200, { votes: [voteRow()] }));
    const votes = await fetchVotes("/registry", 1n, "7", "next");
    expect(votes.items).toHaveLength(1);
  });
});
