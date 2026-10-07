import { describe, expect, it } from "vitest";
import { type NameBlockInput, nameSubmitBlock } from "./name-block";

const MEHOW = { label: "mehow", name: "mehow.lelantos.xyz" };
const ready = (over: Partial<NameBlockInput> = {}): NameBlockInput => ({
  syncErrored: false,
  balancesLoading: false,
  handle: { kind: "available", handle: MEHOW },
  fee: "ready",
  fundingProblem: undefined,
  addressShown: true,
  acknowledged: true,
  ...over,
});

describe("nameSubmitBlock", () => {
  it("opens once everything is in place", () => {
    expect(nameSubmitBlock(ready())).toEqual({ disabled: false });
  });

  it.each<[string, Partial<NameBlockInput>, string | undefined]>([
    ["a wallet still syncing", { balancesLoading: true }, "Still adding up your balance"],
    ["an empty field", { handle: { kind: "empty" } }, "Enter the handle you want"],
    ["a malformed handle", { handle: { kind: "invalid", problem: "x" } }, undefined],
    [
      "a check in flight",
      { handle: { kind: "checking", handle: MEHOW } },
      "Checking that the handle is free",
    ],
    [
      "a failed check",
      { handle: { kind: "check-failed", handle: MEHOW } },
      "Couldn't check that the handle is free",
    ],
    ["a taken handle", { handle: { kind: "taken", handle: MEHOW } }, "That handle is taken"],
    ["a fee still being read", { fee: "loading" }, "Reading the registrar's fee"],
    ["an unreadable fee", { fee: "failed" }, "Couldn't read the registrar's fee"],
    ["nothing to pay with", { fundingProblem: "You need more" }, "You need more"],
    ["no address on screen yet", { addressShown: false }, "Working out the address to publish"],
    [
      "an unticked confirmation",
      { acknowledged: false },
      "Tick the box to confirm you understand what becomes public",
    ],
  ])("holds for %s", (_, over, reason) => {
    expect(nameSubmitBlock(ready(over))).toEqual(
      reason === undefined ? { disabled: true } : { disabled: true, reason },
    );
  });

  it("names a stale wallet ahead of anything else", () => {
    const block = nameSubmitBlock(ready({ syncErrored: true, handle: { kind: "empty" } }));
    expect(block.reason).toContain("claiming a handle is paused");
  });

  it("asks for the confirmation last, so it is never ticked for a handle that cannot be claimed", () => {
    const block = nameSubmitBlock(
      ready({ acknowledged: false, handle: { kind: "taken", handle: MEHOW } }),
    );
    expect(block.reason).toBe("That handle is taken");
  });
});
