// The cached-registry path. `ChainProvider` renders whatever this returns
// before the relayer has answered, so a bad entry here is a bad app, not a
// slow one.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadChainRegistry, readCachedChainRegistry } from "@/config/chains";
import { env } from "@/config/env";
import { localStore } from "@/shared/lib/storage";

// Mirrors REGISTRY_CACHE_KEY in config/chains.ts, which is not exported: the key
// is an implementation detail. Built from `env.relayerUrl`
// rather than written out, because that value is absolutised by
// `toAbsoluteUrl` and so differs between jsdom and a real deployment; a
// hardcoded literal here silently addressed a key nothing else used, and the
// corruption tests passed against a cache they had never touched.
const KEY = `lelantos.chain-registry.v1.${env.relayerUrl}`;

const row = (chainId: number) => ({
  chainId,
  chainName: "base",
  rpcUrl: "https://rpc.example",
  maspAddress: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
  relayerAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  treeDepth: 10,
});

const body = (...ids: number[]) => ({ chains: ids.map(row) });

/// A `fetch` that resolves the given body, as the relayer would.
const respondWith = (value: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => value } as Response);

beforeEach(() => {
  localStore.remove(KEY);
});

describe("readCachedChainRegistry", () => {
  it("is undefined before the relayer has ever been reached", () => {
    expect(readCachedChainRegistry()).toBeUndefined();
  });

  it("returns the chains a previous load stored", async () => {
    vi.stubGlobal("fetch", respondWith(body(8453)));
    await loadChainRegistry();

    const cached = readCachedChainRegistry();
    expect(cached?.map((c) => c.chainId)).toEqual([8453n]);
    // bigints survive the round trip: the cache stores the relayer's body and
    // re-maps it, precisely because JSON.stringify refuses a bigint.
    expect(typeof cached?.[0].chainId).toBe("bigint");
  });

  // The whole point of re-running the parse on read rather than storing mapped
  // entries: a truncated or hand-edited body must not reach the app.
  it("discards a corrupt entry rather than rendering from it", () => {
    localStore.set(KEY, "{not json");
    expect(readCachedChainRegistry()).toBeUndefined();
    // And drops it, so it is not re-read and re-rejected on every boot.
    expect(localStore.get(KEY)).toBeUndefined();
  });

  it("discards a body that parses but does not match the schema", () => {
    localStore.set(KEY, JSON.stringify({ chains: "not-an-array" }));
    expect(readCachedChainRegistry()).toBeUndefined();
    expect(localStore.get(KEY)).toBeUndefined();
  });

  // `undefined`, not `[]`. The provider tells "nothing cached" from "the
  // relayer serves nothing" and words the two differently.
  it("is undefined when every cached row is unusable", () => {
    localStore.set(KEY, JSON.stringify({ chains: [{ chainId: 31337 }] }));
    expect(readCachedChainRegistry()).toBeUndefined();
  });
});

describe("loadChainRegistry caching", () => {
  it("does not cache an empty answer", async () => {
    vi.stubGlobal("fetch", respondWith({ chains: [] }));
    await loadChainRegistry();
    // Seeding a future boot with this would render "no usable network" from
    // cache before the relayer had been asked again.
    expect(localStore.get(KEY)).toBeUndefined();
  });

  it("replaces a previous cache with the newer answer", async () => {
    vi.stubGlobal("fetch", respondWith(body(8453)));
    await loadChainRegistry();

    vi.stubGlobal("fetch", respondWith(body(1, 8453)));
    await loadChainRegistry();

    expect(readCachedChainRegistry()?.map((c) => c.chainId)).toEqual([1n, 8453n]);
  });

  it("leaves the last good cache in place when the relayer fails", async () => {
    vi.stubGlobal("fetch", respondWith(body(8453)));
    await loadChainRegistry();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 } as Response));
    await expect(loadChainRegistry()).rejects.toThrow("502");

    // The cached chains are still the right ones; a relayer outage does not
    // make them wrong, which is why the provider keeps rendering from them.
    expect(readCachedChainRegistry()?.map((c) => c.chainId)).toEqual([8453n]);
  });
});
