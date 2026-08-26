import { evmAddress } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import type { ChainEntry } from "@/config/chains";
import { chainLabel, chainMismatch, describeChainMismatch } from "./chain-guard";

function chain(chainId: bigint, chainName: string): ChainEntry {
  const addr = evmAddress("0x0000000000000000000000000000000000000001");
  return {
    chainId,
    chainName,
    rpcUrl: "http://localhost:8545",
    maspAddress: addr,
    relayerAddress: addr,
    treeDepth: 20,
    tokens: [],
  };
}

const LOCAL = chain(31337n, "anvil");
const SEPOLIA = chain(11155111n, "sepolia");
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

  // The wallet being somewhere the deployment does not serve is the case the
  // page most needs to name — nothing else in the app describes that chain.
  it("reports a wallet on an unregistered chain, by id", () => {
    const m = chainMismatch(REGISTRY, LOCAL, 1);
    expect(m?.walletLabel).toBe("chain 1");
    expect(m && describeChainMismatch(m)).toBe(
      "this link holds funds on anvil; your wallet is on chain 1.",
    );
  });

  // Neither is fixable by switching: either no wallet is connected yet, or the
  // link names a chain the deployment does not serve, which the flow rejects
  // separately.
  it("stays clear with no wallet and with no link chain", () => {
    expect(chainMismatch(REGISTRY, LOCAL, undefined)).toBeUndefined();
    expect(chainMismatch(REGISTRY, undefined, 11155111)).toBeUndefined();
  });
});
