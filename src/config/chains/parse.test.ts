// @vitest-environment jsdom
import { RAY } from "@lelantos-org/sdk/core";
import { describe, expect, it } from "vitest";
import { makeChain } from "@/test/fixtures/chains";
import { deployment, MASP, RELAYER, relayer } from "@/test/fixtures/registry";
import { describeUnusable, entriesFromResponse, toChainEntry } from "./parse";
import type { AssetRow, RegistryChainRow, RelayerChainRow } from "./schema";
import { chainKey, findChain } from "./types";

const entry = (chainId: bigint, chainName: string) => makeChain({ chainId, chainName });

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

/// Unwraps a chain expected to be usable.
const usable = (
  registry: RegistryChainRow,
  relayerRow: RelayerChainRow = relayer(registry.chainId),
  assets: AssetRow[] = [],
) => {
  const r = toChainEntry(registry, relayerRow, assets);
  if (!r.ok) throw new Error(`expected a usable chain: ${describeUnusable(r.reason.reason)}`);
  return r.entry;
};

/// Why a chain expected to be unusable was dropped.
const unusable = (
  registry: RegistryChainRow,
  relayerRow: RelayerChainRow,
  assets: AssetRow[] = [],
) => {
  const r = toChainEntry(registry, relayerRow, assets);
  if (r.ok) throw new Error(`expected chain ${registry.chainId} to be unusable`);
  return r.reason.reason;
};

describe("toChainEntry", () => {
  // A deployment without the read proxy keeps working: reads go to the same
  // endpoint the wallet uses, which is the behaviour before the proxy existed.
  it("takes a chain both services fully describe, with no optional parts", () => {
    const e = usable(deployment(8453));
    expect(e).toMatchObject({
      chainId: 8453n,
      chainName: "base",
      rpcUrl: "https://rpc.example",
      readRpcUrl: "https://rpc.example",
      treeDepth: 10,
      relayerAddress: RELAYER,
    });
    expect(e.nativeAdapterAddress).toBeUndefined();
    expect(e.swapWrapperAddress).toBeUndefined();
    expect(e.permit2Address).toBeUndefined();
    expect(e.explorerUrl).toBeUndefined();
  });

  // The two must stay separate. `rpcUrl` is installed into the user's wallet by
  // `wallet_addEthereumChain`; putting the read-only, rate-limited proxy there
  // would make it that chain's endpoint for writes, subscriptions and the
  // wallet's own background polling, none of which it serves.
  it("keeps the read endpoint separate from the one the wallet is given", () => {
    const e = usable({ ...deployment(8453), readRpcUrl: "https://app.example/rpc/v1/8453" });
    expect(e.readRpcUrl).toBe("https://app.example/rpc/v1/8453");
    expect(e.rpcUrl).toBe("https://rpc.example");
  });

  // The two services are the only source. A build-time fallback would let a
  // deployment run on stale baked-in addresses while appearing correctly
  // configured.
  it("has no build-time fallback: an undescribed chain is unusable", () => {
    expect(
      unusable({ chainId: 31337 }, { chainId: 31337, maspAddress: MASP, treeDepth: 10 }),
    ).toEqual({
      kind: "incomplete",
      fields: ["rpcUrl", "maspAddress", "relayerAddress", "treeDepth"],
    });
  });

  it.each([
    ["rpcUrl"],
    ["maspAddress"],
    ["treeDepth"],
  ])("drops a chain the deployment does not describe %s on, rather than half-building it", (field) => {
    const row: Record<string, unknown> = deployment(8453);
    delete row[field];
    // The reason names the field, so an operator can see what to fill in.
    expect(unusable(row as RegistryChainRow, relayer(8453))).toEqual({
      kind: "incomplete",
      fields: [field],
    });
  });

  it("drops a chain whose relayer will not name its signer", () => {
    const { relayerAddress: _drop, ...rest } = relayer(8453);
    expect(unusable(deployment(8453), rest)).toEqual({
      kind: "incomplete",
      fields: ["relayerAddress"],
    });
  });

  // These four moved off the relayer and onto registry-webserver. Reading them
  // from the deployment is the whole point of the split: a self-hosted relayer
  // has no authority over any of them.
  it("takes the deployment's contracts and explorer", () => {
    const e = usable({
      ...deployment(8453),
      permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      nativeAdapterAddress: "0x3333333333333333333333333333333333333333",
      swapWrapperAddress: "0x4444444444444444444444444444444444444444",
      explorerUrl: "https://basescan.org",
    });
    expect(e.permit2Address).toBe("0x000000000022D473030F116dDEE9F6B43aC78BA3");
    expect(e.nativeAdapterAddress).toBe("0x3333333333333333333333333333333333333333");
    expect(e.swapWrapperAddress).toBe("0x4444444444444444444444444444444444444444");
    expect(e.explorerUrl).toBe("https://basescan.org");
  });

  it("names an undescribed chain after its id rather than leaving it blank", () => {
    const { chainName: _drop, ...rest } = deployment(8453);
    expect(usable(rest).chainName).toBe("chain 8453");
  });
});

// The check that makes a third-party or self-hosted relayer safe to boot from.
// Without it, a relayer pointed at another pool is discovered only after a proof
// has been built against it.
describe("the cross-check between the deployment and the relayer", () => {
  const OTHER_POOL = "0x5555555555555555555555555555555555555555";

  /// The conflicts a disagreeing relayer was dropped for.
  const conflicts = (relayerRow: RelayerChainRow) => {
    const reason = unusable(deployment(8453), relayerRow);
    // A disagreement, not a missing field: the distinction matters, since this
    // is the case that can mean a relayer is pointed somewhere it should not be.
    if (reason.kind !== "disagreement") throw new Error(`dropped as ${reason.kind}`);
    return reason.conflicts;
  };

  it("drops a relayer writing to a different pool, quoting both sides", () => {
    const [conflict] = conflicts({ ...relayer(8453), maspAddress: OTHER_POOL });
    // Both sides, so an operator can see which one is wrong.
    expect(conflict).toContain("maspAddress");
    expect(conflict).toContain(OTHER_POOL);
    expect(conflict).toContain(MASP);
  });

  it("drops a relayer mirroring a different tree shape", () => {
    expect(conflicts({ ...relayer(8453), treeDepth: 11 })[0]).toContain("treeDepth");
  });

  it("reports both disagreements at once rather than only the first", () => {
    expect(conflicts({ ...relayer(8453), maspAddress: OTHER_POOL, treeDepth: 11 })).toHaveLength(2);
  });

  // Both services checksum what they publish, so this should not arise — but the
  // check must judge the address, not its spelling. Rejecting a correct relayer
  // over capitalisation would be the same outage as accepting a wrong one.
  it("accepts a relayer whose address differs only in case", () => {
    expect(
      usable({ ...deployment(8453), maspAddress: MASP.toLowerCase() }, relayer(8453)),
    ).toBeDefined();
  });
});

describe("entriesFromResponse", () => {
  const bundle = (registryChains: unknown[], relayerChains: unknown[], assets: unknown[] = []) => ({
    registryChains: { chains: registryChains },
    assets,
    relayerChains: { chains: relayerChains },
  });

  it("keeps a chain both services describe", () => {
    const entries = entriesFromResponse(bundle([deployment(8453)], [relayer(8453)]), "network");
    expect(entries.map((e) => e.chainId)).toEqual([8453n]);
  });

  // No relayer means nothing can be submitted, however well the deployment
  // describes the chain.
  it("drops a chain no relayer serves", () => {
    const entries = entriesFromResponse(bundle([deployment(8453)], []), "network");
    expect(entries).toEqual([]);
  });

  // And the reverse: with no deployment record there is no rpcUrl to reach the
  // chain with, and nothing to check the relayer against.
  it("drops a chain the deployment registry does not describe", () => {
    const entries = entriesFromResponse(bundle([], [relayer(8453)]), "network");
    expect(entries).toEqual([]);
  });

  // The scheme check lives in `schema.ts`, but its *consequences* are here:
  // what a rejected URL degrades to is decided per field by `parseChain`, and
  // that is the part worth pinning.
  describe("URLs with a scheme that is not http(s)", () => {
    it("drops a hostile explorerUrl without taking the chain with it", () => {
      const entries = entriesFromResponse(
        bundle([{ ...deployment(8453), explorerUrl: "javascript:alert(1)" }], [relayer(8453)]),
        "network",
      );
      // The chain stays usable; only the link is gone. Nothing renders an
      // `href` it could have executed from.
      expect(entries.map((e) => e.chainId)).toEqual([8453n]);
      expect(entries[0]?.explorerUrl).toBeUndefined();
    });

    // rpcUrl is required, so rejecting it takes the chain out — per chain, by
    // the same path a genuinely absent value takes, rather than throwing the
    // whole bundle and failing boot for every chain in it.
    it("drops the chain when rpcUrl is one", () => {
      const entries = entriesFromResponse(
        bundle([{ ...deployment(8453), rpcUrl: "javascript:alert(1)" }], [relayer(8453)]),
        "network",
      );
      expect(entries).toEqual([]);
    });

    it("leaves every other chain in the bundle usable", () => {
      const entries = entriesFromResponse(
        bundle(
          [{ ...deployment(8453), rpcUrl: "data:text/html,x" }, deployment(31337)],
          [relayer(8453), relayer(31337)],
        ),
        "network",
      );
      expect(entries.map((e) => e.chainId)).toEqual([31337n]);
    });

    it("falls back to rpcUrl when readRpcUrl is one", () => {
      const entries = entriesFromResponse(
        bundle([{ ...deployment(8453), readRpcUrl: "javascript:alert(1)" }], [relayer(8453)]),
        "network",
      );
      expect(entries[0]?.readRpcUrl).toBe("https://rpc.example");
    });
  });

  // How a same-origin read proxy is published — the shape the dev stack uses and
  // the one a `connect-src 'self'` deployment would need.
  it("resolves a page-relative readRpcUrl against the page origin", () => {
    const entries = entriesFromResponse(
      bundle([{ ...deployment(8453), readRpcUrl: "/rpc/v1/8453" }], [relayer(8453)]),
      "network",
    );
    expect(entries[0]?.readRpcUrl).toBe(`${window.location.origin}/rpc/v1/8453`);
  });

  it("groups the flat asset list by chain", () => {
    const asset = (chainId: number, assetId: number) => ({
      chainId,
      assetId,
      token: MASP,
      scale: "1",
    });
    const entries = entriesFromResponse(
      bundle(
        [deployment(1), deployment(8453)],
        [relayer(1), relayer(8453)],
        [asset(1, 7), asset(8453, 1), asset(8453, 2)],
      ),
      "network",
    );
    expect(entries.map((e) => e.tokens.map((t) => t.id))).toEqual([[7n], [1n, 2n]]);
  });

  it("leaves a chain with no indexed assets usable", () => {
    const [only] = entriesFromResponse(bundle([deployment(8453)], [relayer(8453)]), "network");
    // Empty means the indexer has not caught up, not that the chain is broken.
    expect(only?.tokens).toEqual([]);
  });

  it("sorts by chain id, so the switcher order does not follow response order", () => {
    const entries = entriesFromResponse(
      bundle([deployment(8453), deployment(1)], [relayer(8453), relayer(1)]),
      "network",
    );
    expect(entries.map((e) => e.chainId)).toEqual([1n, 8453n]);
  });

  it("keeps the good chains when one disagrees", () => {
    const entries = entriesFromResponse(
      bundle([deployment(1), deployment(8453)], [relayer(1), { ...relayer(8453), treeDepth: 99 }]),
      "network",
    );
    expect(entries.map((e) => e.chainId)).toEqual([1n]);
  });
});

describe("assets with unparseable fields", () => {
  /// The asset off a chain that parsed, given one raw asset row.
  const only = (raw: unknown) => {
    const result = toChainEntry(deployment(1), relayer(1), [raw as AssetRow]);
    expect(result.ok).toBe(true);
    return result.ok ? result.entry.tokens[0] : undefined;
  };

  const asset = (extra: Record<string, unknown>) => ({
    chainId: 1,
    assetId: 1,
    token: MASP,
    scale: "1",
    ...extra,
  });

  // `evmAddress` throws, and this mapping runs outside the fetch's try, so
  // without a per-chain result one bad address would reject the whole registry.
  // zod's `z.string()` does not check that `scale` is numeric either, and
  // `BigInt("1.5")` is a SyntaxError.
  it("skips a chain with a malformed address or a non-integer scale instead of throwing", () => {
    const bad = "not-an-address";
    expect(() =>
      unusable({ ...deployment(1), maspAddress: bad }, { ...relayer(1), maspAddress: bad }),
    ).not.toThrow();
    expect(() =>
      unusable(deployment(1), relayer(1), [asset({ scale: "1.5" }) as AssetRow]),
    ).not.toThrow();
  });

  // Every asset held as plain custody sends no `yieldState`. `RAY` is the
  // identity for every conversion, so this keeps exactly today's arithmetic.
  it("reads an asset with no yieldState as plain custody at RAY", () => {
    const a = only(asset({}));
    expect(a?.index).toBe(RAY);
    expect(a?.yieldEnabled).toBe(false);
    expect(a?.yieldHalted).toBe(false);
  });

  it("carries the index and the halted flag when the pool reports them", () => {
    const a = only(
      asset({
        yieldState: {
          venue: RELAYER,
          gross: "1100000",
          supply: "1000000",
          index: "1100000000000000000000000000",
          halted: true,
        },
      }),
    );
    expect(a?.index).toBe(1_100_000_000_000_000_000_000_000_000n);
    expect(a?.yieldEnabled).toBe(true);
    expect(a?.yieldHalted).toBe(true);
  });

  /// A yield block with whatever rate fields the case is about.
  const withYield = (extra: Record<string, unknown>) =>
    asset({
      yieldState: {
        venue: RELAYER,
        gross: "1000000",
        supply: "1000000",
        index: "1000000000000000000000000000",
        halted: false,
        ...extra,
      },
    });

  it("converts the rate out of basis points and its window into days", () => {
    const a = only(withYield({ apyBps: 418, apyWindowS: 7 * 86_400 }));
    expect(a?.apy?.rate).toBeCloseTo(0.0418, 9);
    expect(a?.apy?.windowDays).toBe(7);
  });

  // Absent is not zero. A measurement that could not be made sends neither
  // field, and an asset that renders `0.00%` for that is claiming a measurement.
  it("leaves the rate undefined when the registry sent none", () => {
    const a = only(withYield({}));
    expect(a?.yieldEnabled).toBe(true);
    expect(a?.apy).toBeUndefined();
  });

  // A rate with no window cannot be labelled honestly, and a window with no
  // rate says nothing; either alone is a malformed row.
  it("drops a rate that arrives without its window, and the reverse", () => {
    expect(only(withYield({ apyBps: 418 }))?.apy).toBeUndefined();
    expect(only(withYield({ apyWindowS: 604_800 }))?.apy).toBeUndefined();
  });

  // The backend refuses to annualize a window this short, so a row carrying one
  // is malformed rather than merely fresh. The floor mirrors the backend's own,
  // which is two days — a looser one here would render a figure the backend
  // says it never emits.
  it("drops a window shorter than the measurement's floor", () => {
    expect(only(withYield({ apyBps: 418, apyWindowS: 3_600 }))?.apy).toBeUndefined();
    expect(only(withYield({ apyBps: 418, apyWindowS: 86_400 }))?.apy).toBeUndefined();
    expect(only(withYield({ apyBps: 418, apyWindowS: 2 * 86_400 }))?.apy).toBeDefined();
  });

  it("carries the vault's name, and leaves it undefined when none was read", () => {
    expect(only(withYield({ vaultName: "Steakhouse USDC" }))?.vaultName).toBe("Steakhouse USDC");
    expect(only(withYield({}))?.vaultName).toBeUndefined();
    expect(only(asset({}))?.vaultName).toBeUndefined();
  });

  it("keeps a venue loss, which is a real outcome", () => {
    expect(only(withYield({ apyBps: -250, apyWindowS: 604_800 }))?.apy?.rate).toBeCloseTo(
      -0.025,
      9,
    );
  });

  // The row's existing contract: an asset the catalog cannot fully describe is
  // still usable and only the label degrades. A yield block that fails its
  // schema must not take the asset — or the chain — down with it.
  it("drops a malformed yieldState rather than the asset", () => {
    const a = only(asset({ yieldState: { venue: 42, gross: null } }));
    expect(a).toBeDefined();
    expect(a?.index).toBe(RAY);
    expect(a?.yieldEnabled).toBe(false);
  });
});
