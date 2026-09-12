// The rate column's refusals: no rate without its window, no 0% for "not
// measured", no error for "paused".

import { describe, expect, it } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import { formatWindowShort, rateLabel } from "./rate-label";

const WETH = makeAsset(1n, "WETH");
const USDC = makeAsset(2n, "USDC", {
  decimals: 6,
  yieldEnabled: true,
  apy: { rate: 0.0418, windowDays: 9 },
});
const WBTC = makeAsset(4n, "WBTC", { yieldEnabled: true, yieldHalted: true });

describe("rateLabel", () => {
  it("never shows a rate without the window it was measured over", () => {
    expect(rateLabel(USDC)).toEqual({
      kind: "rate",
      rate: "4.18% / yr",
      window: "measured over 9d",
    });
  });

  it("shows a dash, not 0%, when a yield asset's rate cannot be measured", () => {
    expect(rateLabel(makeAsset(5n, "USDT", { yieldEnabled: true }))).toEqual({
      kind: "unmeasured",
    });
  });

  it("reads a halted venue as paused, even with a stale rate on it", () => {
    expect(rateLabel({ ...WBTC, apy: { rate: 0.05, windowDays: 7 } })).toEqual({ kind: "paused" });
  });

  it("says a plain-custody asset does not earn", () => {
    expect(rateLabel(WETH)).toEqual({ kind: "plain" });
  });
});

describe("formatWindowShort", () => {
  it("states the measured window, whatever it came to", () => {
    expect(formatWindowShort(7)).toBe("7d");
    expect(formatWindowShort(9)).toBe("9d");
    expect(formatWindowShort(1)).toBe("1d");
  });
});
