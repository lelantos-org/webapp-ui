// @vitest-environment jsdom
// The cached-registry path. `ChainProvider` renders whatever this returns
// before either service has answered, so a bad entry here is a bad app, not a
// slow one.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadChainRegistry, readCachedChainRegistry } from "@/config/chains";
import { env } from "@/config/env";
import { localStore } from "@/shared/lib/storage/safe";
import { deployment, relayer } from "@/test/fixtures/registry";

// Mirrors REGISTRY_CACHE_KEY in config/chains/registry.ts, which is not
// exported: the key is an implementation detail. Built from the two service URLs
// rather than written out, because both are absolutised by `toAbsoluteUrl` and
// so differ between jsdom and a real deployment; a hardcoded literal here
// silently addressed a key nothing else used, and the corruption tests passed
// against a cache they had never touched.
const KEY = `lelantos.chain-registry.v1.${env.registryUrl}|${env.relayerUrl}`;

/// The three bodies a boot reads, for the given chains.
const bodies = (...ids: number[]) => ({
  registryChains: { chains: ids.map(deployment) },
  assets: [],
  relayerChains: { chains: ids.map(relayer) },
});

/// A `fetch` that answers each of the three boot requests from one bundle,
/// dispatching on the URL the way the two services would.
const respondWith = (bundle: {
  registryChains: unknown;
  assets: unknown;
  relayerChains: unknown;
}) =>
  vi.fn().mockImplementation((url: string) => {
    const body = url.endsWith("/v1/assets")
      ? bundle.assets
      : url.endsWith("/v1/chains")
        ? bundle.registryChains
        : bundle.relayerChains;
    return Promise.resolve({ ok: true, json: async () => body } as Response);
  });

beforeEach(() => {
  localStore.remove(KEY);
});

describe("readCachedChainRegistry", () => {
  it("is undefined before either service has ever been reached", () => {
    expect(readCachedChainRegistry()).toBeUndefined();
  });

  it("returns the chains a previous load stored", async () => {
    vi.stubGlobal("fetch", respondWith(bodies(8453)));
    await loadChainRegistry();

    const cached = readCachedChainRegistry();
    expect(cached?.map((c) => c.chainId)).toEqual([8453n]);
    // bigints survive the round trip: the cache stores the services' bodies and
    // re-merges them, precisely because JSON.stringify refuses a bigint.
    expect(typeof cached?.[0]?.chainId).toBe("bigint");
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
    localStore.set(KEY, JSON.stringify({ registryChains: { chains: "not-an-array" } }));
    expect(readCachedChainRegistry()).toBeUndefined();
    expect(localStore.get(KEY)).toBeUndefined();
  });

  // The cache re-runs the merge, not just the schemas, so a bundle whose two
  // halves disagree is rejected on read exactly as it would be off the network.
  it("re-runs the cross-check on read rather than trusting what it stored", () => {
    localStore.set(
      KEY,
      JSON.stringify({
        registryChains: { chains: [deployment(8453)] },
        assets: [],
        relayerChains: {
          chains: [{ ...relayer(8453), maspAddress: "0x5555555555555555555555555555555555555555" }],
        },
      }),
    );
    expect(readCachedChainRegistry()).toBeUndefined();
  });

  // `undefined`, not `[]`. The provider tells "nothing cached" from "the
  // deployment serves nothing" and words the two differently.
  it("is undefined when every cached chain is unusable", () => {
    localStore.set(
      KEY,
      JSON.stringify({
        registryChains: { chains: [{ chainId: 31337 }] },
        assets: [],
        relayerChains: { chains: [relayer(31337)] },
      }),
    );
    expect(readCachedChainRegistry()).toBeUndefined();
  });
});

describe("loadChainRegistry caching", () => {
  it("does not cache an empty answer", async () => {
    vi.stubGlobal("fetch", respondWith(bodies()));
    await loadChainRegistry();
    // Seeding a future boot with this would render "no usable network" from
    // cache before either service had been asked again.
    expect(localStore.get(KEY)).toBeUndefined();
  });

  it("replaces a previous cache with the newer answer", async () => {
    vi.stubGlobal("fetch", respondWith(bodies(8453)));
    await loadChainRegistry();

    vi.stubGlobal("fetch", respondWith(bodies(1, 8453)));
    await loadChainRegistry();

    expect(readCachedChainRegistry()?.map((c) => c.chainId)).toEqual([1n, 8453n]);
  });

  it("leaves the last good cache in place when a service fails", async () => {
    vi.stubGlobal("fetch", respondWith(bodies(8453)));
    await loadChainRegistry();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 } as Response));
    await expect(loadChainRegistry()).rejects.toThrow("502");

    // The cached chains are still the right ones; an outage does not make them
    // wrong, which is why the provider keeps rendering from them.
    expect(readCachedChainRegistry()?.map((c) => c.chainId)).toEqual([8453n]);
  });

  // Three fetches on the boot path, and a bare "fetch failed" would leave an
  // operator guessing which of the two services is down.
  it("names the service behind a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation((url: string) =>
          Promise.resolve(
            url.endsWith("/v1/assets")
              ? ({ ok: false, status: 503 } as Response)
              : ({ ok: true, json: async () => ({ chains: [] }) } as Response),
          ),
        ),
    );
    await expect(loadChainRegistry()).rejects.toThrow("registry /v1/assets responded 503");
  });
});
