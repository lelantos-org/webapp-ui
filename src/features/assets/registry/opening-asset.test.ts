import { describe, expect, it } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import { priceKey } from "../prices/prices";
import { askedAsset, heldAsset } from "./opening-asset";

const USDC = makeAsset(1n, "USDC", { decimals: 6 });
const WETH = makeAsset(2n, "WETH");
const DAI = makeAsset(3n, "DAI");
const assets = [USDC, WETH, DAI];

const prices = new Map([
  [priceKey(USDC.token), { priceUsd: 1, priceAt: 0 }],
  [priceKey(WETH.token), { priceUsd: 2_000, priceAt: 0 }],
]);
const NO_PRICES = new Map();

const holding = (asset: { id: bigint }, balance: bigint) => ({ asset: asset.id, balance });

describe("askedAsset", () => {
  it("takes the asset the URL names", () => {
    expect(askedAsset(assets, "?asset=2")).toBe("2");
  });

  it("ignores an asset the chain does not register, and a URL that names none", () => {
    expect(askedAsset(assets, "?asset=9")).toBeUndefined();
    expect(askedAsset(assets, "?asset=weth")).toBeUndefined();
    expect(askedAsset(assets, "")).toBeUndefined();
  });
});

describe("heldAsset", () => {
  const pick = (
    balances: ReturnType<typeof holding>[],
    over: { lastUsed?: string; prices?: typeof prices } = {},
  ) => heldAsset({ assets, balances, prices: over.prices ?? prices, lastUsed: over.lastUsed });

  it("is nothing for a wallet that holds nothing", () => {
    expect(pick([])).toBeUndefined();
    expect(pick([holding(USDC, 0n)])).toBeUndefined();
  });

  it("is the largest holding by dollar value, not by figure", () => {
    // 500 USDC against 1 WETH at $2,000.
    expect(pick([holding(USDC, 500_000_000n), holding(WETH, 10n ** 18n)])).toBe("2");
  });

  it("is the asset last sent while it is still held", () => {
    const held = [holding(USDC, 500_000_000n), holding(WETH, 10n ** 18n)];
    expect(pick(held, { lastUsed: "1" })).toBe("1");
    expect(pick([holding(WETH, 10n ** 18n)], { lastUsed: "1" })).toBe("2");
  });

  it("never ranks an unpriced holding over a priced one", () => {
    expect(pick([holding(USDC, 1n), holding(DAI, 10n ** 24n)])).toBe("1");
  });

  it("is the first holding where nothing is priced", () => {
    expect(pick([holding(WETH, 1n), holding(DAI, 5n)], { prices: NO_PRICES })).toBe("2");
  });
});
