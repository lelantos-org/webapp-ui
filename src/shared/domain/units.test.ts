import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import { baseUnitsUsd, usdValue } from "./units";

describe("usdValue", () => {
  it("prices whole tokens", () => {
    expect(usdValue(1_500_000n, 6, 1n, 0.99, RAY)).toBeCloseTo(1.485, 9);
  });

  it("converts circuit units through scale before decimals", () => {
    expect(usdValue(2_000_000n, 18, 10n ** 12n, 3000, RAY)).toBeCloseTo(6000, 6);
  });

  it("keeps the integer part of an 18-decimal balance", () => {
    const usd = usdValue(1_234_567n * 10n ** 18n, 18, 1n, 2, RAY);
    expect(usd).toBeCloseTo(2_469_134, 0);
  });

  it("handles an asset with no fractional units", () => {
    expect(usdValue(7n, 0, 1n, 3, RAY)).toBe(21);
  });

  it("returns zero for a zero balance", () => {
    expect(usdValue(0n, 18, 1n, 3000, RAY)).toBe(0);
  });

  it("values a balance in USD at the index, not at scale", () => {
    const index = (RAY * 11n) / 10n;
    expect(usdValue(1_000_000n, 6, 1n, 2, RAY)).toBeCloseTo(2, 6);
    expect(usdValue(1_000_000n, 6, 1n, 2, index)).toBeCloseTo(2.2, 6);
  });
});

describe("baseUnitsUsd", () => {
  it("is usdValue for an amount already in base units", () => {
    expect(baseUnitsUsd(1_500_000n, 6, 0.99)).toBe(usdValue(1_500_000n, 6, 1n, 0.99, RAY));
    expect(baseUnitsUsd(7n, 0, 3)).toBe(21);
  });
});
