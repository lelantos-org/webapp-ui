import { describe, expect, it } from "vitest";
import {
  exceedsPublicInLimit,
  formatAmountForAsset,
  formatDecimal,
  PUBLIC_IN_MAX,
  parseAmountForAsset,
  parseDecimal,
  relativeTime,
  shortAddr,
} from "./format";

describe("parseDecimal", () => {
  it("scales by decimals", () => {
    expect(parseDecimal("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    expect(parseDecimal("1", 6)).toBe(1_000_000n);
    expect(parseDecimal("0", 6)).toBe(0n);
  });

  it("pads a short fraction rather than misreading it", () => {
    // "0.1" at 6dp is 100000, not 1.
    expect(parseDecimal("0.1", 6)).toBe(100_000n);
    expect(parseDecimal("0.000001", 6)).toBe(1n);
  });

  it("strips grouping separators", () => {
    expect(parseDecimal("1,234.5", 2)).toBe(123_450n);
    expect(parseDecimal("1_000", 0)).toBe(1000n);
  });

  it("rejects more fractional digits than the asset can hold", () => {
    expect(() => parseDecimal("0.0000001", 6)).toThrow(/too many fractional digits/);
  });

  it("rejects malformed input instead of coercing it", () => {
    for (const bad of ["", "abc", "1.2.3", "-1", "1e5", ".5", "1."]) {
      expect(() => parseDecimal(bad, 6), bad).toThrow();
    }
  });
});

describe("formatDecimal", () => {
  it("round-trips with parseDecimal", () => {
    // Expected values carry the grouping separators formatDecimal adds.
    const cases: ReadonlyArray<readonly [string, number, string]> = [
      ["1.5", 18, "1.5"],
      ["1234.5678", 6, "1,234.5678"],
      ["0.1", 6, "0.1"],
      ["1000000", 0, "1,000,000"],
    ];
    for (const [input, decimals, expected] of cases) {
      expect(formatDecimal(parseDecimal(input, decimals), decimals), input).toBe(expected);
    }
  });

  it("drops trailing fractional zeros but keeps significant ones", () => {
    expect(formatDecimal(100_000n, 6)).toBe("0.1");
    expect(formatDecimal(101_000n, 6)).toBe("0.101");
    expect(formatDecimal(1_000_000n, 6)).toBe("1");
  });

  it("groups the integer part", () => {
    expect(formatDecimal(1_234_567n, 0)).toBe("1,234,567");
  });

  it("handles negatives", () => {
    expect(formatDecimal(-1_500_000n, 6)).toBe("-1.5");
  });
});

describe("parseAmountForAsset", () => {
  // scale is the circuit→base multiplier: base = circuit * scale.
  it("divides base units down to circuit units", () => {
    expect(parseAmountForAsset("1", 18, 10n ** 12n)).toBe(1_000_000n);
  });

  it("passes through when scale is 1", () => {
    expect(parseAmountForAsset("1.5", 6, 1n)).toBe(1_500_000n);
  });

  it("rejects precision the asset cannot represent", () => {
    // 1 wei at scale 10^12 is not a whole circuit unit.
    expect(() => parseAmountForAsset("0.000000000000000001", 18, 10n ** 12n)).toThrow(
      /precision exceeds asset granularity/,
    );
  });

  it("round-trips through formatAmountForAsset", () => {
    const scale = 10n ** 12n;
    const circuit = parseAmountForAsset("2.5", 18, scale);
    expect(formatAmountForAsset(circuit, 18, scale)).toBe("2.5");
  });
});

describe("exceedsPublicInLimit", () => {
  it("tracks the SDK's uint48 contract bound", () => {
    expect(PUBLIC_IN_MAX).toBe((1n << 48n) - 1n);
  });

  it("accepts the cap and rejects one above it", () => {
    expect(exceedsPublicInLimit(PUBLIC_IN_MAX)).toBe(false);
    expect(exceedsPublicInLimit(PUBLIC_IN_MAX + 1n)).toBe(true);
    expect(exceedsPublicInLimit(0n)).toBe(false);
  });
});

describe("shortAddr", () => {
  it("elides the middle of a full address", () => {
    // Default n=6: "0x" + 6 leading chars, then the 6 trailing chars.
    expect(shortAddr("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x123456…345678");
  });

  it("leaves short strings and empties alone", () => {
    expect(shortAddr("0x1234")).toBe("0x1234");
    expect(shortAddr(undefined)).toBe("");
  });
});

describe("relativeTime", () => {
  const now = 1_700_000_000_000;
  it("picks a unit by magnitude", () => {
    expect(relativeTime(now - 30_000, now)).toMatch(/30 sec/);
    expect(relativeTime(now - 5 * 60_000, now)).toMatch(/5 min/);
    expect(relativeTime(now - 3 * 3_600_000, now)).toMatch(/3 hr/);
    expect(relativeTime(now - 2 * 86_400_000, now)).toMatch(/2 days/);
  });
});
