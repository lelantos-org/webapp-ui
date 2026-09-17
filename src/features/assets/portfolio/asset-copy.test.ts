import { describe, expect, it } from "vitest";
import { yieldGain as gain } from "@/test/fixtures/prices";
import { earnedDetail, earnedLine, supportedLine } from "./asset-copy";

const meta = (over: Partial<Parameters<typeof earnedLine>[1]> = {}) => ({
  yieldEnabled: true,
  yieldHalted: false,
  decimals: 18,
  symbol: "WETH",
  ...over,
});

describe("earnedLine", () => {
  it("is absent for plain custody", () => {
    expect(
      earnedLine(gain({ gain: 10n ** 17n }), meta({ yieldEnabled: false }), 2000),
    ).toBeUndefined();
  });

  it("is absent when no basis resolved", () => {
    expect(earnedLine(gain({ resolvedNotes: 0, unknownNotes: 3 }), meta(), 2000)).toBeUndefined();
    expect(earnedLine(undefined, meta(), 2000)).toBeUndefined();
  });

  it("states a priced gain in dollars", () => {
    expect(earnedLine(gain({ gain: 10n ** 16n }), meta(), 2000)).toEqual({
      text: "+$20.00 earned",
      tone: "up",
    });
  });

  it("falls back to token units when the asset has no price", () => {
    expect(earnedLine(gain({ gain: 10n ** 17n }), meta(), undefined)?.text).toBe(
      "+0.1 WETH earned",
    );
  });

  it("marks a partial figure as a lower bound", () => {
    expect(earnedLine(gain({ gain: 10n ** 16n, unknownNotes: 2 }), meta(), 2000)?.text).toBe(
      "≥+$20.00 earned",
    );
  });

  it("renders a venue loss as a negative in warn", () => {
    expect(earnedLine(gain({ gain: -(10n ** 16n) }), meta(), 2000)).toEqual({
      text: "−$20.00 earned",
      tone: "down",
    });
  });

  it("tints a paused venue's figure", () => {
    expect(earnedLine(gain({ gain: 10n ** 16n }), meta({ yieldHalted: true }), 2000)?.tone).toBe(
      "paused",
    );
  });
});

describe("earnedDetail", () => {
  it("gives token units and the signed growth", () => {
    expect(earnedDetail(gain({ gain: 10n ** 17n }), 18)).toEqual({
      amount: "+0.1",
      percent: "+10.00%",
      partial: false,
      down: false,
    });
  });

  it("keeps a loss negative rather than clamping it", () => {
    const d = earnedDetail(gain({ gain: -(10n ** 17n) }), 18);
    expect(d.amount).toBe("−0.1");
    expect(d.percent).toBe("-10.00%");
    expect(d.down).toBe(true);
  });

  it("has no figure without a resolved basis", () => {
    expect(earnedDetail(gain({ resolvedNotes: 0, unknownNotes: 1 }), 18).amount).toBeUndefined();
  });

  it("marks a partial figure", () => {
    expect(earnedDetail(gain({ gain: 10n ** 17n, unknownNotes: 1 }), 18).amount).toBe("≥+0.1");
  });
});

describe("supportedLine", () => {
  it("counts in words, as the design sets it", () => {
    expect(supportedLine(5, "Base")).toBe("These five assets are supported on Base right now.");
  });

  it("falls back to digits past ten", () => {
    expect(supportedLine(12, "Base")).toBe("These 12 assets are supported on Base right now.");
  });

  it("reads naturally for one and none", () => {
    expect(supportedLine(1, "Base")).toBe("This asset is supported on Base right now.");
    expect(supportedLine(0, "Base")).toBe("No assets are supported on Base yet.");
  });
});
