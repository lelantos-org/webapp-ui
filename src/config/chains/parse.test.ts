import { RAY } from "@lelantos-org/sdk/core";
import { describe, expect, it } from "vitest";
import { toChainEntry } from "./parse";
import type { ChainEntry } from "./types";
import { chainKey, findChain } from "./types";

const entry = (chainId: bigint, chainName: string): ChainEntry =>
  ({ chainId, chainName }) as ChainEntry;

describe("chainKey", () => {
  // The exact radix matters less than there being only one: without a single
  // spelling, the same chain writes itself two ways across IndexedDB,
  // sessionStorage and localStorage.
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

  // The relayer is the only source. A build-time fallback would let a deployment
  // run on stale baked-in addresses while appearing correctly configured.
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
    // `evmAddress` throws, and this mapping runs outside the fetch's try, so
    // without a per-row result one chain publishing a bad address would reject
    // the whole registry.
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

  // A relayer predating the yield mixin sends no `yieldState`, and so does every
  // asset held as plain custody. `RAY` is the identity for every conversion, so
  // both keep exactly today's arithmetic.
  it("reads an asset with no yieldState as plain custody at RAY", () => {
    const result = toChainEntry({
      ...good,
      tokens: [{ assetId: 1, token: good.maspAddress, scale: "1" }],
    } as never);
    expect(result.ok).toBe(true);
    const asset = result.ok ? result.entry.tokens[0] : undefined;
    expect(asset?.index).toBe(RAY);
    expect(asset?.yieldEnabled).toBe(false);
    expect(asset?.yieldHalted).toBe(false);
  });

  it("carries the index and the halted flag when the pool reports them", () => {
    const result = toChainEntry({
      ...good,
      tokens: [
        {
          assetId: 1,
          token: good.maspAddress,
          scale: "1",
          yieldState: {
            venue: good.relayerAddress,
            gross: "1100000",
            supply: "1000000",
            index: "1100000000000000000000000000",
            halted: true,
          },
        },
      ],
    } as never);
    expect(result.ok).toBe(true);
    const asset = result.ok ? result.entry.tokens[0] : undefined;
    expect(asset?.index).toBe(1_100_000_000_000_000_000_000_000_000n);
    expect(asset?.yieldEnabled).toBe(true);
    expect(asset?.yieldHalted).toBe(true);
  });

  /// A yield block with whatever rate fields the case is about.
  const withYield = (extra: Record<string, unknown>) =>
    ({
      ...good,
      tokens: [
        {
          assetId: 1,
          token: good.maspAddress,
          scale: "1",
          yieldState: {
            venue: good.relayerAddress,
            gross: "1000000",
            supply: "1000000",
            index: "1000000000000000000000000000",
            halted: false,
            ...extra,
          },
        },
      ],
    }) as never;

  /// The asset off a row that parsed.
  const only = (row: never) => {
    const result = toChainEntry(row);
    expect(result.ok).toBe(true);
    return result.ok ? result.entry.tokens[0] : undefined;
  };

  it("converts the rate out of basis points and its window into days", () => {
    const asset = only(withYield({ apyBps: 418, apyWindowS: 7 * 86_400 }));
    expect(asset?.apy?.rate).toBeCloseTo(0.0418, 9);
    expect(asset?.apy?.windowDays).toBe(7);
  });

  // Absent is not zero. A relayer that could not measure sends neither field,
  // and an asset that renders `0.00%` for that is claiming a measurement.
  it("leaves the rate undefined when the relayer sent none", () => {
    const asset = only(withYield({}));
    expect(asset?.yieldEnabled).toBe(true);
    expect(asset?.apy).toBeUndefined();
  });

  // A rate with no window cannot be labelled honestly, and a window with no
  // rate says nothing; either alone is a malformed row.
  it("drops a rate that arrives without its window, and the reverse", () => {
    expect(only(withYield({ apyBps: 418 }))?.apy).toBeUndefined();
    expect(only(withYield({ apyWindowS: 604_800 }))?.apy).toBeUndefined();
  });

  // The relayer refuses to measure a window this short, so a row carrying one
  // is malformed rather than merely fresh. The floor mirrors the backend's own,
  // which is two days — a looser one here would render a figure the backend
  // says it never emits.
  it("drops a window shorter than the relayer's floor", () => {
    expect(only(withYield({ apyBps: 418, apyWindowS: 3_600 }))?.apy).toBeUndefined();
    expect(only(withYield({ apyBps: 418, apyWindowS: 86_400 }))?.apy).toBeUndefined();
    expect(only(withYield({ apyBps: 418, apyWindowS: 2 * 86_400 }))?.apy).toBeDefined();
  });

  it("keeps a venue loss, which is a real outcome", () => {
    expect(only(withYield({ apyBps: -250, apyWindowS: 604_800 }))?.apy?.rate).toBeCloseTo(
      -0.025,
      9,
    );
  });

  // The row's existing contract: an asset the relayer cannot fully describe is
  // still usable and only the label degrades. A yield block that fails its
  // schema must not take the asset — or the chain — down with it.
  it("drops a malformed yieldState rather than the asset", () => {
    const result = toChainEntry({
      ...good,
      tokens: [
        {
          assetId: 1,
          token: good.maspAddress,
          scale: "1",
          yieldState: { venue: 42, gross: null },
        },
      ],
    } as never);
    expect(result.ok).toBe(true);
    const asset = result.ok ? result.entry.tokens[0] : undefined;
    expect(asset).toBeDefined();
    expect(asset?.index).toBe(RAY);
    expect(asset?.yieldEnabled).toBe(false);
  });
});
