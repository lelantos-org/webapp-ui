// The rate column's refusals: no rate without its window, no 0% for "not
// measured", no error for "paused".

import { describe, expect, it } from "vitest";
import { type AssetOverrides, makeAsset } from "@/test/fixtures/assets";
import { assetRateTag, formatWindowShort, rateLabel } from "./rate-label";

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

const asset = (over: AssetOverrides = {}) => makeAsset(1n, "USDC", { decimals: 6, ...over });

/// The same words `rateLabel` gives the Shield picker and the portfolio, as the
/// text a native `<option>` can hold. Halted is still
/// backed; not measurable is not zero, and a bare dash in a native option
/// explains nothing to a screen reader.
describe("assetRateTag", () => {
  it.each([
    ["plain custody", asset(), "does not earn"],
    [
      "a rate, with its window",
      asset({ yieldEnabled: true, apy: { rate: 0.0418, windowDays: 9 } }),
      "4.18% / yr · 9d",
    ],
    ["an unmeasurable rate", asset({ yieldEnabled: true }), "rate cannot be measured"],
    [
      "a halted venue with a stale rate",
      asset({ yieldEnabled: true, yieldHalted: true, apy: { rate: 0.05, windowDays: 7 } }),
      "paused · still fully backed",
    ],
  ])("tags %s", (_label, a, tag) => {
    expect(assetRateTag(a)).toBe(tag);
  });
});
