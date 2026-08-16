import { describe, expect, it } from "vitest";
import { type ChainEntry, chainKey, findChain, toChainEntry } from "@/config/chains";
import { env } from "@/config/env";

const entry = (chainId: bigint, chainName: string): ChainEntry =>
  ({ chainId, chainName }) as ChainEntry;

describe("chainKey", () => {
  // The value matters less than its being the only spelling. Five key formats
  // used to derive their own — two in decimal, three in hex — so the same
  // chain wrote itself two ways across IndexedDB, sessionStorage and
  // localStorage.
  it("is hex, without a 0x prefix", () => {
    expect(chainKey(31337n)).toBe("7a69");
    expect(chainKey(1n)).toBe("1");
    expect(chainKey(8453n)).toBe("2105");
  });

  it("separates chains that share a decimal prefix", () => {
    expect(chainKey(1n)).not.toBe(chainKey(17n));
  });
});

describe("findChain", () => {
  const registry = [entry(1n, "mainnet"), entry(31337n, "local")];

  it("matches on chainId", () => {
    expect(findChain(registry, 31337n)?.chainName).toBe("local");
  });

  it("returns undefined for a chain the deployment does not serve", () => {
    expect(findChain(registry, 8453n)).toBeUndefined();
  });

  it("returns undefined against an empty registry", () => {
    expect(findChain([], 1n)).toBeUndefined();
  });
});

describe("toChainEntry", () => {
  /// The chain this bundle was built for; only it may fall back to `env`.
  const BUILT_FOR = Number(env.chainId);
  const OTHER = 8453;

  const full = (chainId: number) => ({
    chainId,
    chainName: "base",
    rpcUrl: "https://rpc.example",
    maspAddress: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
    relayerAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    treeDepth: 10,
  });

  /// Unwraps a row expected to be usable.
  const entry = (row: Parameters<typeof toChainEntry>[0]) => {
    const r = toChainEntry(row);
    if (!r.ok) throw new Error(`expected a usable chain, missing: ${r.reason.missing}`);
    return r.entry;
  };

  it("takes a fully described chain the deployment does not match", () => {
    const e = entry(full(OTHER));
    expect(e.chainId).toBe(BigInt(OTHER));
    expect(e.chainName).toBe("base");
    expect(e.rpcUrl).toBe("https://rpc.example");
    expect(e.treeDepth).toBe(10);
  });

  // The fallback is the whole risk in this mapping: `env` describes exactly
  // one deployment, so letting a second chain inherit its RPC or MASP address
  // would point a wallet at the wrong pool while looking configured.
  it("never lends env's config to a chain it was not built for", () => {
    const r = toChainEntry({ chainId: OTHER });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.missing).toContain("rpcUrl");
  });

  it("fills the built-for chain from env when the relayer says nothing", () => {
    const e = entry({ chainId: BUILT_FOR });
    expect(e.chainId).toBe(BigInt(BUILT_FOR));
    expect(e.rpcUrl).toBe(env.rpcUrl);
    expect(e.treeDepth).toBe(env.treeDepth);
  });

  it("prefers the relayer's value over env for the built-for chain", () => {
    expect(entry({ ...full(BUILT_FOR), rpcUrl: "https://from-relayer" }).rpcUrl).toBe(
      "https://from-relayer",
    );
  });

  it.each([
    ["rpcUrl"],
    ["maspAddress"],
    ["relayerAddress"],
    ["treeDepth"],
  ])("drops a chain missing %s rather than half-building it", (field) => {
    const row: Record<string, unknown> = full(OTHER);
    delete row[field];
    const r = toChainEntry(row as Parameters<typeof toChainEntry>[0]);
    expect(r.ok).toBe(false);
    // The reason names the field, so an operator can see what to fill in.
    if (!r.ok) expect(r.reason.missing).toEqual([field]);
  });

  it("leaves optional contracts absent when nobody supplies them", () => {
    const e = entry(full(OTHER));
    expect(e.nativeAdapterAddress).toBeUndefined();
    expect(e.swapWrapperAddress).toBeUndefined();
  });

  it("names an undescribed chain after its id rather than leaving it blank", () => {
    const { chainName: _drop, ...rest } = full(OTHER);
    expect(entry(rest).chainName).toBe(`chain ${OTHER}`);
  });
});
