import { RAY } from "@lelantos-org/sdk/core";
import { describe, expect, it } from "vitest";
import { assetUsd, priceOf } from "./asset-usd";
import type { PriceMap } from "./use-prices";

const priceMap = (entries: Record<string, number>): PriceMap =>
  new Map(Object.entries(entries).map(([k, v]) => [k, { priceUsd: v, priceAt: 0 }]));

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

  it("applies scale, so a scaled asset is not understated", () => {
    const asset = { decimals: 18, scale: 10n ** 12n, index: RAY, token: "0xAAAA" };
    expect(assetUsd(2_000_000n, asset, priceMap({ "0xaaaa": 3000 }))).toBeCloseTo(6000, 6);
  });

  it("is undefined rather than zero when the asset has no price", () => {
    const asset = { decimals: 18, scale: 1n, index: RAY, token: "0xBBBB" };
    expect(assetUsd(10n ** 18n, asset, priceMap({ "0xaaaa": 1 }))).toBeUndefined();
  });

  it("is undefined for an asset with no address", () => {
    const asset = { decimals: 18, scale: 1n, index: RAY };
    expect(assetUsd(10n ** 18n, asset, priceMap({ "0xaaaa": 1 }))).toBeUndefined();
  });
});
