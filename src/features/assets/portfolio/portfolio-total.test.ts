import { describe, expect, it } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import { makeAsset } from "@/test/fixtures/assets";
import { priceMap, yieldGain } from "@/test/fixtures/prices";
import type { AssetBalanceView } from "../balances/use-balances";
import type { YieldGain } from "../yield/yield-gains";
import { earnedTotal, portfolioTotal } from "./portfolio-total";

function asset(id: bigint, token: string, decimals = 18, scale = 1n): RegisteredAsset {
  return makeAsset(id, `T${id}`, { token, decimals, scale });
}

function row(assetId: bigint, balance: bigint, pending = 0n): AssetBalanceView {
  return { asset: assetId, balance, notes: 1, pending, outflow: 0n };
}

const byId = (...assets: RegisteredAsset[]) => new Map(assets.map((a) => [a.id, a]));

describe("portfolioTotal", () => {
  it("sums the priced rows", () => {
    const a = asset(1n, "0xAAAA", 18);
    const b = asset(2n, "0xBBBB", 6);
    const got = portfolioTotal(
      [row(1n, 2n * 10n ** 18n), row(2n, 1_500_000n)],
      byId(a, b),
      priceMap({ "0xaaaa": 3000, "0xbbbb": 1 }),
    );
    expect(got.usd).toBeCloseTo(6001.5, 6);
    expect(got.priced).toBe(2);
    expect(got.unpriced).toBe(0);
  });

  it("counts a held asset with no price instead of treating it as zero", () => {
    const a = asset(1n, "0xAAAA", 18);
    const b = asset(2n, "0xBBBB", 18);
    const got = portfolioTotal(
      [row(1n, 10n ** 18n), row(2n, 5n * 10n ** 18n)],
      byId(a, b),
      priceMap({ "0xaaaa": 2 }),
    );
    expect(got.usd).toBeCloseTo(2, 9);
    expect(got.priced).toBe(1);
    expect(got.unpriced).toBe(1);
  });

  it("includes pending amounts, matching the figure the row shows", () => {
    const a = asset(1n, "0xAAAA", 18);
    const got = portfolioTotal(
      [row(1n, 10n ** 18n, 2n * 10n ** 18n)],
      byId(a),
      priceMap({ "0xaaaa": 10 }),
    );
    expect(got.usd).toBeCloseTo(30, 9);
  });

  it("ignores a zero balance rather than flagging it unpriced", () => {
    const a = asset(1n, "0xAAAA", 18);
    const b = asset(2n, "0xBBBB", 18);
    const got = portfolioTotal(
      [row(1n, 10n ** 18n), row(2n, 0n)],
      byId(a, b),
      priceMap({ "0xaaaa": 2 }),
    );
    expect(got.priced).toBe(1);
    expect(got.unpriced).toBe(0);
  });

  it("counts a row whose asset is missing from the registry as unpriced", () => {
    const got = portfolioTotal([row(9n, 10n ** 18n)], byId(), priceMap({}));
    expect(got.usd).toBe(0);
    expect(got.priced).toBe(0);
    expect(got.unpriced).toBe(1);
  });

  it("reports nothing priced for an empty portfolio", () => {
    expect(portfolioTotal([], byId(), priceMap({}))).toEqual({
      usd: 0,
      priced: 0,
      unpriced: 0,
    });
  });
});

describe("earnedTotal", () => {
  const gain = (g: bigint, over: Partial<YieldGain> = {}) => yieldGain({ gain: g, ...over });

  it("sums priced gains in dollars, reading them as base units", () => {
    const a = asset(1n, "0xAAAA", 6);
    const b = asset(2n, "0xBBBB", 18);
    const got = earnedTotal(
      new Map([
        [1n, gain(12_400_000n)],
        [2n, gain(10n ** 16n)],
      ]),
      byId(a, b),
      priceMap({ "0xAAAA": 1, "0xBBBB": 2000 }),
    );
    expect(got?.usd).toBeCloseTo(32.4, 6);
    expect(got?.partial).toBe(false);
  });

  it("is undefined when nothing could be counted", () => {
    const a = asset(1n, "0xAAAA", 6);
    expect(earnedTotal(new Map(), byId(a), priceMap({}))).toBeUndefined();
    expect(
      earnedTotal(
        new Map([[1n, gain(5n, { resolvedNotes: 0, unknownNotes: 2 })]]),
        byId(a),
        priceMap({ "0xAAAA": 1 }),
      ),
    ).toBeUndefined();
    expect(earnedTotal(new Map([[1n, gain(5n)]]), byId(a), priceMap({}))).toBeUndefined();
  });

  it("marks the total partial when an earning asset is left out", () => {
    const a = asset(1n, "0xAAAA", 6);
    const b = asset(2n, "0xBBBB", 6);
    const unpriced = earnedTotal(
      new Map([
        [1n, gain(1_000_000n)],
        [2n, gain(1_000_000n)],
      ]),
      byId(a, b),
      priceMap({ "0xAAAA": 1 }),
    );
    expect(unpriced).toEqual({ usd: 1, partial: true });

    const unresolved = earnedTotal(
      new Map([[1n, gain(1_000_000n, { unknownNotes: 1 })]]),
      byId(a),
      priceMap({ "0xAAAA": 1 }),
    );
    expect(unresolved?.partial).toBe(true);
  });

  it("keeps a venue loss negative", () => {
    const a = asset(1n, "0xAAAA", 6);
    const got = earnedTotal(new Map([[1n, gain(-2_000_000n)]]), byId(a), priceMap({ "0xAAAA": 1 }));
    expect(got?.usd).toBeCloseTo(-2, 6);
  });
});
