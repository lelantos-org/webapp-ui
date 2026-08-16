import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { describe, expect, it } from "vitest";
import type { Phase } from "@/features/claim-link/phase-machine";
import { linkChainIdOf } from "@/features/claim-link/phase-presenter";

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
