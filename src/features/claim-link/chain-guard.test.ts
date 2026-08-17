import { evmAddress } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import type { ChainEntry } from "@/config/chains";
import { claimChainMismatch, describeChainMismatch } from "@/features/claim-link/chain-guard";

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

describe("claimChainMismatch", () => {
  it("is clear when the wallet is on the link's chain", () => {
    expect(claimChainMismatch(REGISTRY, 31337n, 31337)).toBeUndefined();
  });

  it("reports the wallet sitting on another served chain", () => {
    const m = claimChainMismatch(REGISTRY, 31337n, 11155111);
    expect(m?.link).toBe(LOCAL);
    expect(m?.wallet).toBe(SEPOLIA);
  });

  // The wallet being somewhere the deployment does not serve is the case the
  // page most needs to name — nothing else in the app describes that chain.
  it("reports a wallet on an unregistered chain, by id", () => {
    const m = claimChainMismatch(REGISTRY, 31337n, 1);
    expect(m?.wallet).toBeUndefined();
    expect(m?.walletChainId).toBe(1n);
    expect(m && describeChainMismatch(m)).toBe(
      "this link holds funds on anvil; your wallet is on chain 1.",
    );
  });

  // Switching cannot fix either of these, so neither is a mismatch to report:
  // no wallet is connected yet, or the link names a chain nobody serves — the
  // flow fails that link on its own.
  it("stays clear with no wallet, no link chain, or an unserved link chain", () => {
    expect(claimChainMismatch(REGISTRY, 31337n, undefined)).toBeUndefined();
    expect(claimChainMismatch(REGISTRY, undefined, 11155111)).toBeUndefined();
    expect(claimChainMismatch(REGISTRY, 999n, 31337)).toBeUndefined();
  });
});
