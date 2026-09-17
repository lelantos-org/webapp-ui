import { describe, expect, it } from "vitest";
import {
  eligibilityNotice,
  formatDuration,
  formatShare,
  formatVotes,
  governanceErrorText,
  phaseLine,
  stateLabel,
  stateTone,
} from "./governance-copy";

describe("formatDuration", () => {
  it("shows the two largest units", () => {
    expect(formatDuration(2 * 86_400 + 4 * 3_600 + 5)).toBe("2d 4h");
    expect(formatDuration(3_600 + 120)).toBe("1h 2m");
    expect(formatDuration(312)).toBe("5m 12s");
    expect(formatDuration(40)).toBe("40s");
    expect(formatDuration(-5)).toBe("0s");
  });
});

describe("phaseLine", () => {
  const w = { voteStart: 100, voteEnd: 400, quorumVoteDeadline: 340 };
  it("names the next clock that matters", () => {
    expect(phaseLine("upcoming", w, 40)).toBe("Voting opens in 1m 0s");
    expect(phaseLine("open", w, 280)).toBe("For/Abstain close in 1m 0s");
    expect(phaseLine("open", { voteStart: 100, voteEnd: 400 }, 340)).toBe("Voting closes in 1m 0s");
    expect(phaseLine("against", w, 370)).toBe("Against-only window · closes in 30s");
    expect(phaseLine(undefined, w, 370)).toBeUndefined();
  });
});

describe("formatting", () => {
  it("keeps two decimals of votes and one of a percentage", () => {
    expect(formatVotes(1_234_567_000_000_000_000n, 18)).toBe("1.23");
    expect(formatShare(1_250)).toBe("12.5%");
    expect(formatShare(5_000)).toBe("50%");
    expect(stateLabel(undefined)).toBe("Unknown");
  });
});

describe("stateTone", () => {
  it.each([
    ["Active", "accent"],
    ["Pending", "warn"],
    ["Queued", "warn"],
    ["Succeeded", "ok"],
    ["Executed", "ok"],
    ["Defeated", "err"],
    ["Expired", "err"],
    ["Canceled", "neutral"],
    [undefined, "neutral"],
  ] as const)("%s is %s", (state, tone) => {
    expect(stateTone(state)).toBe(tone);
  });
});

describe("eligibilityNotice", () => {
  it("points each reason at its own fix", () => {
    expect(eligibilityNotice({ ok: false, reason: "not-delegated" }).body).toMatch(/delegate/i);
    expect(eligibilityNotice({ ok: false, reason: "delegated-after-snapshot" }).body).toMatch(
      /snapshot/,
    );
    expect(eligibilityNotice({ ok: false, reason: "no-votes" }).body).toMatch(/Shielded/);
    expect(eligibilityNotice({ ok: false, reason: "already-voted" }).title).toMatch(/voted/);
    expect(eligibilityNotice({ ok: false, reason: "not-active" }).title).toMatch(/not open/);
    expect(eligibilityNotice({ ok: false, reason: "no-signer" }).body).toMatch(/browser wallet/);
    expect(eligibilityNotice({ ok: false, reason: "no-signer" }, "custom").body).toBe("custom");
  });
});

describe("governanceErrorText", () => {
  it("explains the quorum-vote refusal in the user's terms", () => {
    expect(governanceErrorText("quorum-vote-closed")).toMatch(/Only Against/);
  });

  it.each([
    "already-voted",
    "not-active",
    "below-threshold",
    "unknown-proposal",
    "bad-proposal",
    "restricted-proposer",
    "reverted",
  ] as const)("has a line for %s", (code) => {
    expect(governanceErrorText(code)).toBeTruthy();
  });

  it("has nothing to add for an unknown failure", () => {
    expect(governanceErrorText(undefined)).toBeUndefined();
  });
});
