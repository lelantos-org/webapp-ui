import { describe, expect, it } from "vitest";
import { type ChainEntry, chainKey, findChain, toChainEntry } from "@/config/chains";

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

  it("takes a fully described chain", () => {
    const e = entry(full(8453));
    expect(e.chainId).toBe(8453n);
    expect(e.chainName).toBe("base");
    expect(e.rpcUrl).toBe("https://rpc.example");
    expect(e.treeDepth).toBe(10);
  });

  // The relayer is the only source. Build-time values used to stand in for
  // whichever chain the bundle was configured for, which let a deployment run
  // on stale baked-in addresses while looking correctly configured.
  it("has no build-time fallback: an undescribed chain is unusable", () => {
    const r = toChainEntry({ chainId: 31337 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.missing).toEqual(["rpcUrl", "maspAddress", "relayerAddress", "treeDepth"]);
    }
  });

  it.each([
    ["rpcUrl"],
    ["maspAddress"],
    ["relayerAddress"],
    ["treeDepth"],
  ])("drops a chain missing %s rather than half-building it", (field) => {
    const row: Record<string, unknown> = full(8453);
    delete row[field];
    const r = toChainEntry(row as Parameters<typeof toChainEntry>[0]);
    expect(r.ok).toBe(false);
    // The reason names the field, so an operator can see what to fill in.
    if (!r.ok) expect(r.reason.missing).toEqual([field]);
  });

  it("leaves optional contracts absent when the relayer omits them", () => {
    const e = entry(full(8453));
    expect(e.nativeAdapterAddress).toBeUndefined();
    expect(e.swapWrapperAddress).toBeUndefined();
    expect(e.permit2Address).toBeUndefined();
    expect(e.explorerUrl).toBeUndefined();
  });

  it("names an undescribed chain after its id rather than leaving it blank", () => {
    const { chainName: _drop, ...rest } = full(8453);
    expect(entry(rest).chainName).toBe("chain 8453");
  });
});

describe("toChainEntry with unparseable fields", () => {
  const good = {
    chainId: 1,
    rpcUrl: "http://rpc",
    maspAddress: "0x1111111111111111111111111111111111111111",
    relayerAddress: "0x2222222222222222222222222222222222222222",
    treeDepth: 20,
  };

  it("skips a row with a malformed address instead of throwing", () => {
    // `evmAddress` throws, and this mapping runs outside the fetch's try — so
    // one chain publishing a bad address used to reject the whole registry and
    // show "no chains available" for *every* chain.
    const result = toChainEntry({ ...good, maspAddress: "not-an-address" } as never);
    expect(result.ok).toBe(false);
  });

  it("skips a row whose token scale is not an integer", () => {
    // zod's `z.string()` does not check that `scale` is numeric, and
    // `BigInt("1.5")` is a SyntaxError.
    const result = toChainEntry({
      ...good,
      tokens: [{ assetId: "1", token: good.maspAddress, scale: "1.5" }],
    } as never);
    expect(result.ok).toBe(false);
  });

  it("still accepts a well-formed row", () => {
    expect(toChainEntry(good as never).ok).toBe(true);
  });
});
