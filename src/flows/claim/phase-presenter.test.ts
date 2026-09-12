import { describe, expect, it } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import type { Phase } from "./phase-machine";
import {
  claimStepStates,
  heroSubtitleFor,
  linkChainIdOf,
  stepperStateFor,
} from "./phase-presenter";

const CHAIN = 31337n;
const eph = fakeWalletApi();
const balances = [{ asset: 1n, amount: 100n, notes: 1 }];

describe("linkChainIdOf", () => {
  // The claim page labels the link's balances with this chain's tokens, and
  // offers to move the wallet to it. Getting it wrong mislabels every asset.
  it.each<[string, Phase]>([
    ["need-wallet", { kind: "need-wallet", nskHex: "ab", chainId: CHAIN }],
    ["loading", { kind: "loading", nskHex: "ab", chainId: CHAIN }],
    ["ready", { kind: "ready", nskHex: "ab", chainId: CHAIN, eph, balances }],
    [
      "sweeping",
      { kind: "sweeping", nskHex: "ab", chainId: CHAIN, eph, balances, asset: 1n, amount: 5n },
    ],
  ])("reports the link's chain during %s", (_label, phase) => {
    expect(linkChainIdOf(phase)).toBe(CHAIN);
  });

  // `done` keeps the chain too: the success card names the asset, and the
  // symbol and decimals come from that chain's token list. Dropping it made
  // every successful claim read `1000000000000000000 asset#5`.
  it("keeps the link's chain after the sweep settles", () => {
    expect(
      linkChainIdOf({ kind: "done", txHash: "0x1", chainId: CHAIN, asset: 1n, amount: 5n }),
    ).toBe(CHAIN);
  });

  it("keeps the link's chain on a failure that can be retried", () => {
    expect(
      linkChainIdOf({ kind: "error", message: "boom", nskHex: "ab", chainId: CHAIN, from: "scan" }),
    ).toBe(CHAIN);
  });

  // Before the fragment is decoded there is no chain to know.
  it.each<[string, Phase]>([
    ["reading-fragment", { kind: "reading-fragment" }],
    ["bad-link", { kind: "bad-link", error: "nope", reason: "malformed" }],
  ])("has no chain during %s", (_label, phase) => {
    expect(linkChainIdOf(phase)).toBeUndefined();
  });
});

describe("stepperStateFor", () => {
  it.each<[string, Phase, string]>([
    ["reading-fragment", { kind: "reading-fragment" }, "link"],
    ["need-wallet", { kind: "need-wallet", nskHex: "ab", chainId: CHAIN }, "connect"],
    // Finding the note is the first half of claiming it.
    ["loading", { kind: "loading", nskHex: "ab", chainId: CHAIN }, "claim"],
    ["ready", { kind: "ready", nskHex: "ab", chainId: CHAIN, eph, balances }, "claim"],
  ])("places %s on its step", (_label, phase, current) => {
    expect(stepperStateFor(phase)).toEqual({ current, failed: false, done: false });
  });

  it("fails the link step for a bad link", () => {
    expect(stepperStateFor({ kind: "bad-link", error: "nope", reason: "malformed" })).toEqual({
      current: "link",
      failed: true,
      done: false,
    });
  });

  // A wrong network stops the flow before the scan, so the stepper has to
  // stop there too rather than showing work that is not running.
  it.each<[string, Phase]>([
    ["need-wallet", { kind: "need-wallet", nskHex: "ab", chainId: CHAIN }],
    ["loading", { kind: "loading", nskHex: "ab", chainId: CHAIN }],
    ["ready", { kind: "ready", nskHex: "ab", chainId: CHAIN, eph, balances }],
  ])("holds at the connect step while blocked, during %s", (_label, phase) => {
    expect(stepperStateFor(phase, true)).toEqual({
      current: "connect",
      failed: false,
      done: false,
    });
  });

  // Settled phases keep their own state: a claim that already landed is not
  // undone by the user switching networks afterwards.
  it.each<[string, Phase, boolean]>([
    ["done", { kind: "done", txHash: "0x1", chainId: CHAIN, asset: 1n, amount: 5n }, true],
    [
      "error",
      { kind: "error", message: "boom", nskHex: "ab", chainId: CHAIN, from: "sweep" },
      false,
    ],
  ])("keeps %s terminal even when blocked", (_label, phase, done) => {
    expect(stepperStateFor(phase, true)).toEqual({ current: "claim", failed: !done, done });
  });
});

describe("claimStepStates", () => {
  it("marks the steps before the current one done", () => {
    expect(claimStepStates({ current: "connect", failed: false, done: false })).toEqual([
      "done",
      "current",
      "pending",
    ]);
  });

  it("completes the last step once the claim has landed", () => {
    expect(claimStepStates({ current: "claim", failed: false, done: true })).toEqual([
      "done",
      "done",
      "done",
    ]);
  });

  it("fails only the step that failed", () => {
    expect(claimStepStates({ current: "link", failed: true, done: false })).toEqual([
      "failed",
      "pending",
      "pending",
    ]);
  });
});

describe("heroSubtitleFor", () => {
  // A reload lands here, and the link in the sender's chat is still good — so
  // the two bad-link reasons must not share a line.
  it("does not call a reloaded page an unparseable link", () => {
    const missing = heroSubtitleFor({ kind: "bad-link", error: "gone", reason: "missing" });
    const malformed = heroSubtitleFor({ kind: "bad-link", error: "gone", reason: "malformed" });

    expect(missing).not.toEqual(malformed);
    expect(malformed).toContain("parsed");
  });

  // The network gate card already names both chains and offers the switch.
  it("yields the line to the network gate while blocked", () => {
    expect(
      heroSubtitleFor({ kind: "loading", nskHex: "ab", chainId: CHAIN }, true),
    ).toBeUndefined();
  });
});
