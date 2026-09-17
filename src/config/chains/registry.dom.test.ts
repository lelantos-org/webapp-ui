import { beforeEach, describe, expect, it } from "vitest";
import { loadChainRegistry, readCachedChainRegistry } from "@/config/chains";
import { env } from "@/config/env";
import { localStore } from "@/shared/lib/storage/safe";
import { deployment, relayer } from "@/test/fixtures/registry";
import { jsonResponse, stubFetch } from "@/test/http";

// Mirrors the private cache key; built from env because both URLs are absolutised.
const KEY = `lelantos.chain-registry.v1.${env.registryUrl}|${env.relayerUrl}`;

const bodies = (...ids: number[]) => ({
  registryChains: { chains: ids.map(deployment) },
  assets: [],
  relayerChains: { chains: ids.map(relayer) },
});

const respondWith = (bundle: {
  registryChains: unknown;
  assets: unknown;
  relayerChains: unknown;
}) =>
  stubFetch((url) =>
    url.endsWith("/v1/assets")
      ? bundle.assets
      : url.endsWith("/v1/chains")
        ? bundle.registryChains
        : bundle.relayerChains,
  );

beforeEach(() => {
  localStore.remove(KEY);
});

describe("readCachedChainRegistry", () => {
  it("is undefined before either service has ever been reached", () => {
    expect(readCachedChainRegistry()).toBeUndefined();
  });

  it("returns the chains a previous load stored", async () => {
    respondWith(bodies(8453));
    await loadChainRegistry();

    const cached = readCachedChainRegistry();
    expect(cached?.map((c) => c.chainId)).toEqual([8453n]);
    expect(typeof cached?.[0]?.chainId).toBe("bigint");
  });

  it("discards a corrupt entry rather than rendering from it", () => {
    localStore.set(KEY, "{not json");
    expect(readCachedChainRegistry()).toBeUndefined();
    expect(localStore.get(KEY)).toBeUndefined();
  });

  it("discards a body that parses but does not match the schema", () => {
    localStore.set(KEY, JSON.stringify({ registryChains: { chains: "not-an-array" } }));
    expect(readCachedChainRegistry()).toBeUndefined();
    expect(localStore.get(KEY)).toBeUndefined();
  });

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
    respondWith(bodies());
    await loadChainRegistry();
    expect(localStore.get(KEY)).toBeUndefined();
  });

  it("replaces a previous cache with the newer answer", async () => {
    respondWith(bodies(8453));
    await loadChainRegistry();

    respondWith(bodies(1, 8453));
    await loadChainRegistry();

    expect(readCachedChainRegistry()?.map((c) => c.chainId)).toEqual([1n, 8453n]);
  });

  it("leaves the last good cache in place when a service fails", async () => {
    respondWith(bodies(8453));
    await loadChainRegistry();

    stubFetch(() => jsonResponse({}, { status: 502 }));
    await expect(loadChainRegistry()).rejects.toThrow("502");

    expect(readCachedChainRegistry()?.map((c) => c.chainId)).toEqual([8453n]);
  });

  it("names the service behind a failure", async () => {
    stubFetch((url) =>
      url.endsWith("/v1/assets") ? jsonResponse({}, { status: 503 }) : { chains: [] },
    );
    await expect(loadChainRegistry()).rejects.toThrow("registry /v1/assets responded 503");
  });
});
