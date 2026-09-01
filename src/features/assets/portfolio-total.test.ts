import { RAY } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import type { PriceMap } from "@/features/prices";
import { portfolioTotal } from "./portfolio-total";
import type { AssetBalanceView } from "./use-balances";

function asset(id: bigint, token: string, decimals = 18, scale = 1n): RegisteredAsset {
  return {
    id,
    token: token as RegisteredAsset["token"],
    isWeth: false,
    symbol: `T${id}`,
    decimals,
    scale,
    // Plain custody: one unit is worth `scale` forever.
    index: RAY,
    yieldEnabled: false,
    yieldHalted: false,
  };
}

function row(assetId: bigint, balance: bigint, pending = 0n): AssetBalanceView {
  return { asset: assetId, balance, notes: 1, pending, outflow: 0n };
}

const byId = (...assets: RegisteredAsset[]) => new Map(assets.map((a) => [a.id, a]));

const priceMap = (entries: Record<string, number>): PriceMap =>
  new Map(Object.entries(entries).map(([k, v]) => [k, { priceUsd: v, priceAt: 0 }]));

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
    // The total is real but partial; the caller must say so.
    expect(got.usd).toBeCloseTo(2, 9);
    expect(got.priced).toBe(1);
    expect(got.unpriced).toBe(1);
  });

  it("joins on the token address case-insensitively", () => {
    // The registry gives a checksummed address; the price map is lowercased.
    const a = asset(1n, "0xAbCdEf", 18);
    const got = portfolioTotal([row(1n, 10n ** 18n)], byId(a), priceMap({ "0xabcdef": 4 }));
    expect(got.usd).toBeCloseTo(4, 9);
    expect(got.unpriced).toBe(0);
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
    // Otherwise every wallet on a partly-covered chain reads as incomplete.
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

  it("applies scale, so a scaled asset is not understated", () => {
    const a = asset(1n, "0xAAAA", 18, 10n ** 12n);
    const got = portfolioTotal([row(1n, 2_000_000n)], byId(a), priceMap({ "0xaaaa": 3000 }));
    expect(got.usd).toBeCloseTo(6000, 6);
  });
});
