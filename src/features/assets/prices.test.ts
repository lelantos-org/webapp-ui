import { RAY } from "@lelantos-org/sdk/core";
import { describe, expect, it } from "vitest";
import { priceMap } from "@/test/fixtures/prices";
import { assetUsd, priceKey, priceOf, pricesResponse, toPriceMap } from "./prices";

describe("priceOf", () => {
  it("matches a checksummed address against the lowercased map", () => {
    expect(priceOf(priceMap({ "0xabcdef": 7 }), "0xAbCdEf")).toBe(7);
  });

  it("is undefined for a token the map does not cover", () => {
    expect(priceOf(priceMap({ "0xaaaa": 1 }), "0xbbbb")).toBeUndefined();
  });

  it("is undefined for an asset carrying no address", () => {
    expect(priceOf(priceMap({ "0xaaaa": 1 }), undefined)).toBeUndefined();
  });
});

describe("assetUsd", () => {
  it("prices an amount in circuit units", () => {
    const asset = { decimals: 18, scale: 1n, index: RAY, token: "0xAAAA" };
    expect(assetUsd(2n * 10n ** 18n, asset, priceMap({ "0xaaaa": 3000 }))).toBeCloseTo(6000, 6);
  });

  it("is undefined rather than zero when the asset has no price", () => {
    const asset = { decimals: 18, scale: 1n, index: RAY, token: "0xBBBB" };
    expect(assetUsd(10n ** 18n, asset, priceMap({ "0xaaaa": 1 }))).toBeUndefined();
  });
});

const row = (chainId: number, token: string, priceUsd: number) => ({
  chainId,
  token,
  priceUsd,
  priceAt: 1_700_000_000,
});

describe("toPriceMap", () => {
  it("keeps only the active chain's rows", () => {
    // The same address on another chain is a different asset; pricing a
    // balance off it would be wrong, not merely imprecise.
    const m = toPriceMap([row(1, "0xaaaa", 5), row(8453, "0xaaaa", 9)], 8453n);
    expect(m.get(priceKey("0xaaaa"))?.priceUsd).toBe(9);
    expect(m.size).toBe(1);
  });

  /// The row arrives checksummed and the lookup may use either spelling: both
  /// sides go through `priceKey`, so the map is reachable from whichever the
  /// caller holds.
  it("normalises the key so a checksummed address matches", () => {
    const m = toPriceMap([row(1, "0xAbCdEf", 3)], 1n);
    expect(m.get(priceKey("0xabcdef"))?.priceUsd).toBe(3);
    expect(m.get(priceKey("0xABCDEF"))?.priceUsd).toBe(3);
  });

  it("carries the provider timestamp through", () => {
    const m = toPriceMap([row(1, "0xaaaa", 3)], 1n);
    expect(m.get(priceKey("0xaaaa"))?.priceAt).toBe(1_700_000_000);
  });

  it("is empty when no row matches the chain", () => {
    expect(toPriceMap([row(1, "0xaaaa", 5)], 31337n).size).toBe(0);
  });

  it("handles an empty body", () => {
    expect(toPriceMap([], 1n).size).toBe(0);
  });
});

describe("pricesResponse", () => {
  it("accepts the registry's shape", () => {
    const parsed = pricesResponse.parse({
      prices: [{ chainId: 1, token: "0xaaaa", priceUsd: 1.5, priceAt: 42 }],
    });
    expect(parsed.prices).toHaveLength(1);
  });

  it("accepts an empty list — the anvil and provider-down case", () => {
    expect(pricesResponse.parse({ prices: [] }).prices).toEqual([]);
  });

  it("rejects a price sent as a string", () => {
    // Would otherwise reach `usdValue` and produce NaN dollars on screen.
    expect(() =>
      pricesResponse.parse({
        prices: [{ chainId: 1, token: "0xaaaa", priceUsd: "1.5", priceAt: 42 }],
      }),
    ).toThrow();
  });

  it("rejects a row missing its chain", () => {
    expect(() =>
      pricesResponse.parse({ prices: [{ token: "0xaaaa", priceUsd: 1, priceAt: 1 }] }),
    ).toThrow();
  });

  it("rejects a body that is not a price list at all", () => {
    expect(() => pricesResponse.parse({ chains: [] })).toThrow();
  });
});
