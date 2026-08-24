import { describe, expect, it } from "vitest";
import { pricesResponse, toPriceMap } from "@/features/prices/use-prices";

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
    expect(m.get("0xaaaa")?.priceUsd).toBe(9);
    expect(m.size).toBe(1);
  });

  it("lowercases the key so a checksummed address matches", () => {
    const m = toPriceMap([row(1, "0xAbCdEf", 3)], 1n);
    expect(m.get("0xabcdef")?.priceUsd).toBe(3);
  });

  it("carries the provider timestamp through", () => {
    const m = toPriceMap([row(1, "0xaaaa", 3)], 1n);
    expect(m.get("0xaaaa")?.priceAt).toBe(1_700_000_000);
  });

  it("is empty when no row matches the chain", () => {
    expect(toPriceMap([row(1, "0xaaaa", 5)], 31337n).size).toBe(0);
  });

  it("handles an empty body", () => {
    expect(toPriceMap([], 1n).size).toBe(0);
  });
});

describe("pricesResponse", () => {
  it("accepts the relayer's shape", () => {
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
