import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { describe, expect, it } from "vitest";
import type { Phase } from "@/features/claim-link/phase-machine";
import { linkChainIdOf, stepperStateFor } from "@/features/claim-link/phase-presenter";

const CHAIN = 31337n;
const eph = {} as WalletApi;
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

  // Before the fragment is decoded there is no chain to know, and `done`
  // deliberately drops it — nothing after the sweep is chain-scoped.
  it.each<[string, Phase]>([
    ["reading-fragment", { kind: "reading-fragment" }],
    ["bad-link", { kind: "bad-link", error: "nope" }],
    ["done", { kind: "done", txHash: "0x1", asset: 1n, amount: 5n }],
    ["error", { kind: "error", message: "boom" }],
  ])("has no chain during %s", (_label, phase) => {
    expect(linkChainIdOf(phase)).toBeUndefined();
  });
});

describe("stepperStateFor", () => {
  it("tracks the phase while the wallet is on the link's chain", () => {
    expect(stepperStateFor({ kind: "loading", nskHex: "ab", chainId: CHAIN })).toEqual({
      current: "scan",
      failed: false,
      done: false,
    });
  });

  // A wrong network stops the flow before the scan, so the stepper has to
  // stop there too rather than showing work that is not running.
  it.each<[string, Phase]>([
    ["need-wallet", { kind: "need-wallet", nskHex: "ab", chainId: CHAIN }],
    ["loading", { kind: "loading", nskHex: "ab", chainId: CHAIN }],
    ["ready", { kind: "ready", nskHex: "ab", chainId: CHAIN, eph, balances }],
  ])("holds at the network step while blocked, during %s", (_label, phase) => {
    expect(stepperStateFor(phase, true)).toEqual({
      current: "network",
      failed: false,
      done: false,
    });
  });

  // Settled phases keep their own state: a claim that already landed is not
  // undone by the user switching networks afterwards.
  it.each<[string, Phase, boolean]>([
    ["done", { kind: "done", txHash: "0x1", asset: 1n, amount: 5n }, true],
    ["error", { kind: "error", message: "boom" }, false],
  ])("keeps %s terminal even when blocked", (_label, phase, done) => {
    expect(stepperStateFor(phase, true)).toEqual({ current: "claim", failed: !done, done });
  });
});
