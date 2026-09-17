import { describe, expect, it } from "vitest";
import { makeChain } from "@/test/fixtures/chains";
import { chainLabel, chainMismatch, describeChainMismatch } from "./chain-guard";

const LOCAL = makeChain({ chainId: 31337n, chainName: "anvil" });
const SEPOLIA = makeChain({ chainId: 11155111n, chainName: "sepolia" });
const REGISTRY = [LOCAL, SEPOLIA];

describe("chainLabel", () => {
  it("names a served chain", () => {
    expect(chainLabel(REGISTRY, 11155111n)).toBe("sepolia");
  });

  it("falls back to the id for a chain nobody serves", () => {
    expect(chainLabel(REGISTRY, 1n)).toBe("chain 1");
  });
});

describe("chainMismatch", () => {
  it("is clear when the wallet is on the link's chain", () => {
    expect(chainMismatch(REGISTRY, LOCAL, 31337)).toBeUndefined();
  });

  it("reports the wallet sitting on another served chain", () => {
    expect(chainMismatch(REGISTRY, LOCAL, 11155111)).toEqual({
      link: LOCAL,
      walletChainId: 11155111n,
      walletLabel: "sepolia",
    });
  });

  it("reports a wallet on an unregistered chain, by id", () => {
    const m = chainMismatch(REGISTRY, LOCAL, 1);
    expect(m?.walletLabel).toBe("chain 1");
    expect(m && describeChainMismatch(m)).toBe(
      "this link holds funds on anvil; your wallet is on chain 1.",
    );
  });

  it("stays clear with no wallet and with no link chain", () => {
    expect(chainMismatch(REGISTRY, LOCAL, undefined)).toBeUndefined();
    expect(chainMismatch(REGISTRY, undefined, 11155111)).toBeUndefined();
  });
});
