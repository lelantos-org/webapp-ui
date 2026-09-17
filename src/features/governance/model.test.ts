import { describe, expect, it } from "vitest";
import {
  canPropose,
  composeDescription,
  isZeroAddress,
  proposalBody,
  proposalStateOf,
  proposalTitle,
  proposalWindow,
  shareBps,
  tallyBar,
  type VoteEligibilityInput,
  voteEligibility,
  votingPhase,
  windowPhase,
} from "./model";

describe("proposalStateOf", () => {
  it("follows IGovernor.ProposalState's order", () => {
    expect(proposalStateOf(0)).toBe("Pending");
    expect(proposalStateOf(1)).toBe("Active");
    expect(proposalStateOf(3)).toBe("Defeated");
    expect(proposalStateOf(4)).toBe("Succeeded");
    expect(proposalStateOf(7)).toBe("Executed");
  });

  it("is undefined for a state the enum does not have", () => {
    expect(proposalStateOf(8)).toBeUndefined();
  });
});

describe("windowPhase", () => {
  const w = { voteStart: 100, voteEnd: 400, quorumVoteDeadline: 340 };

  // OZ: Pending while clock <= snapshot, Active while clock <= deadline.
  it("is upcoming up to and including voteStart", () => {
    expect(windowPhase(w, 99)).toBe("upcoming");
    expect(windowPhase(w, 100)).toBe("upcoming");
    expect(windowPhase(w, 101)).toBe("open");
  });

  // For and Abstain are accepted at the quorum-vote deadline and refused one second later.
  it("opens the Against-only window one second past the quorum-vote deadline", () => {
    expect(windowPhase(w, 340)).toBe("open");
    expect(windowPhase(w, 341)).toBe("against");
    expect(windowPhase(w, 400)).toBe("against");
  });

  it("closes one second past voteEnd", () => {
    expect(windowPhase(w, 401)).toBe("closed");
  });

  it("never enters the Against-only window without a quorum-vote deadline", () => {
    const plain = { voteStart: 100, voteEnd: 400 };
    expect(windowPhase(plain, 399)).toBe("open");
  });
});

describe("proposalWindow", () => {
  const indexed = { voteStart: 100, voteEnd: 400, quorumVoteDeadline: 340 };

  it("takes the governor's figures once read", () => {
    const live = { snapshot: 110n, deadline: 410n, quorumVoteDeadline: 350n };
    expect(proposalWindow(indexed, live)).toEqual({
      voteStart: 110,
      voteEnd: 410,
      quorumVoteDeadline: 350,
    });
  });

  it("falls back to the index, field by field", () => {
    expect(proposalWindow(indexed, undefined)).toEqual(indexed);
    const live = { snapshot: 110n, deadline: 410n, quorumVoteDeadline: undefined };
    expect(proposalWindow(indexed, live).quorumVoteDeadline).toBe(340);
    expect(proposalWindow(undefined, undefined)).toEqual({
      voteStart: 0,
      voteEnd: 0,
      quorumVoteDeadline: undefined,
    });
  });
});

describe("votingPhase", () => {
  const w = { voteStart: 100, voteEnd: 400, quorumVoteDeadline: 340 };

  it("reports no phase for a proposal the governor has closed", () => {
    // A canceled proposal inside its window is not open.
    expect(votingPhase("Canceled", w, 200)).toBeUndefined();
    expect(votingPhase("Defeated", w, 500)).toBeUndefined();
    expect(votingPhase(undefined, w, 200)).toBeUndefined();
  });

  it("calls a pending proposal upcoming, whatever the clock says", () => {
    expect(votingPhase("Pending", w, 101)).toBe("upcoming");
  });

  it("follows the calendar while active", () => {
    expect(votingPhase("Active", w, 200)).toBe("open");
    expect(votingPhase("Active", w, 350)).toBe("against");
  });

  // The local clock and the chain disagree by a block; the chain decides.
  it("keeps an active proposal live when the local clock runs ahead of the chain", () => {
    expect(votingPhase("Active", w, 100)).toBe("open");
    expect(votingPhase("Active", w, 401)).toBe("against");
    expect(votingPhase("Active", { voteStart: 100, voteEnd: 400 }, 401)).toBe("open");
  });
});

describe("tallyBar", () => {
  const t = (f: bigint, a: bigint, ab: bigint) => ({ for: f, against: a, abstain: ab });

  it("counts For + Abstain toward quorum, never Against", () => {
    const bar = tallyBar(t(30n, 1000n, 20n), 50n);
    expect(bar.quorumVotes).toBe(50n);
    expect(bar.quorumReached).toBe(true);
    expect(tallyBar(t(30n, 1000n, 19n), 50n).quorumReached).toBe(false);
  });

  it("says whether For leads", () => {
    expect(tallyBar(t(2n, 1n, 0n), 0n).forLeads).toBe(true);
    expect(tallyBar(t(1n, 1n, 0n), 0n).forLeads).toBe(false);
  });

  // With fewer votes than quorum the bar is scaled to quorum, so the marker
  // sits at the far end and the segments show how far there is to go.
  it("scales to the quorum when fewer votes have been cast", () => {
    const bar = tallyBar(t(25n, 0n, 25n), 100n);
    expect(bar.forBps).toBe(2_500);
    expect(bar.abstainBps).toBe(2_500);
    expect(bar.quorumBps).toBe(10_000);
  });

  it("scales to the votes cast once they pass the quorum", () => {
    const bar = tallyBar(t(100n, 50n, 50n), 100n);
    expect(bar.total).toBe(200n);
    expect(bar.forBps).toBe(5_000);
    expect(bar.againstBps).toBe(2_500);
    expect(bar.quorumBps).toBe(5_000);
  });

  it("leaves the marker off until the quorum is known", () => {
    const bar = tallyBar(t(1n, 0n, 0n), undefined);
    expect(bar.quorumBps).toBeUndefined();
    expect(bar.quorumReached).toBeUndefined();
    expect(tallyBar(t(0n, 0n, 0n), 0n).quorumBps).toBeUndefined();
  });

  it("draws an empty proposal as an empty bar", () => {
    const bar = tallyBar(t(0n, 0n, 0n), undefined);
    expect([bar.forBps, bar.abstainBps, bar.againstBps]).toEqual([0, 0, 0]);
  });

  it("keeps precision on 18-decimal weights", () => {
    const e18 = 10n ** 18n;
    const bar = tallyBar(t(3n * 10_000_000n * e18, e18, 0n), undefined);
    expect(bar.forBps).toBe(9_999);
  });
});

describe("shareBps", () => {
  it("is a floored share, 0 of nothing", () => {
    expect(shareBps(1n, 3n)).toBe(3_333);
    expect(shareBps(5n, 0n)).toBe(0);
  });
});

describe("titles", () => {
  it("takes the first non-empty line, without its heading marks", () => {
    expect(proposalTitle("\n\n## Raise the fee\n\nBecause.")).toBe("Raise the fee");
    expect(proposalTitle("   #Title")).toBe("Title");
    expect(proposalTitle("Plain first line\nsecond")).toBe("Plain first line");
  });

  it("caps a title at 200 characters", () => {
    expect(proposalTitle(`# ${"x".repeat(300)}`)).toHaveLength(200);
  });

  it("has no title for an empty description", () => {
    expect(proposalTitle("\n  \n#\n")).toBe("");
    expect(proposalBody("  \n")).toBe("");
  });

  it("keeps the body after the title line", () => {
    expect(proposalBody("# T\n\nLine one\n\nLine two\n")).toBe("Line one\n\nLine two");
    expect(proposalBody("# T")).toBe("");
  });

  it("round-trips through composeDescription", () => {
    const d = composeDescription("  Burn the fees ", "Body\n\nmore ");
    expect(d).toBe("# Burn the fees\n\nBody\n\nmore");
    expect(proposalTitle(d)).toBe("Burn the fees");
    expect(proposalBody(d)).toBe("Body\n\nmore");
    expect(composeDescription("Only", "  ")).toBe("# Only");
  });
});

describe("voteEligibility", () => {
  const ME = "0x1111111111111111111111111111111111111111";
  const ZERO = "0x0000000000000000000000000000000000000000";
  const base: VoteEligibilityInput = {
    canSign: true,
    state: "Active",
    phase: "open",
    hasVoted: false,
    votesAtSnapshot: 10n,
    delegate: ME,
    currentVotes: 10n,
  };
  const why = (over: Partial<VoteEligibilityInput>) => {
    const r = voteEligibility({ ...base, ...over });
    return r.ok ? "ok" : r.reason;
  };

  it("lets a delegated holder vote on an open proposal", () => {
    expect(voteEligibility(base)).toEqual({ ok: true, quorumVoteOpen: true });
  });

  it("offers only Against in the Against-only window", () => {
    expect(voteEligibility({ ...base, phase: "against" })).toEqual({
      ok: true,
      quorumVoteOpen: false,
    });
  });

  it("says nothing else to a session that cannot sign", () => {
    expect(why({ canSign: false, state: "Defeated", votesAtSnapshot: 0n })).toBe("no-signer");
  });

  it("refuses a proposal that is not active", () => {
    expect(why({ state: "Pending", phase: "upcoming" })).toBe("not-active");
    expect(why({ state: "Succeeded", phase: undefined })).toBe("not-active");
    expect(why({ phase: "closed" })).toBe("not-active");
    expect(why({ phase: "upcoming" })).toBe("not-active");
  });

  it("refuses a second vote before looking at weight", () => {
    expect(why({ hasVoted: true, votesAtSnapshot: 0n })).toBe("already-voted");
  });

  it("tells an undelegated holder to delegate", () => {
    expect(why({ votesAtSnapshot: 0n, delegate: ZERO, currentVotes: 0n })).toBe("not-delegated");
    expect(why({ votesAtSnapshot: 0n, delegate: undefined, currentVotes: 0n })).toBe(
      "not-delegated",
    );
  });

  it("tells a holder who delegated after the snapshot that it counts next time", () => {
    expect(why({ votesAtSnapshot: 0n, currentVotes: 5n })).toBe("delegated-after-snapshot");
  });

  it("says a delegated account with nothing to weigh has no votes", () => {
    expect(why({ votesAtSnapshot: 0n, currentVotes: 0n })).toBe("no-votes");
  });
});

describe("canPropose / isZeroAddress", () => {
  it("meets the threshold inclusively", () => {
    expect(canPropose(10n, 10n)).toBe(true);
    expect(canPropose(9n, 10n)).toBe(false);
  });

  it("treats undefined and 0x0 as no address", () => {
    expect(isZeroAddress(undefined)).toBe(true);
    expect(isZeroAddress("0x0000000000000000000000000000000000000000")).toBe(true);
    expect(isZeroAddress("0x0000000000000000000000000000000000000001")).toBe(false);
  });
});
