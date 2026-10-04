import { describe, expect, it } from "vitest";
import {
  formatDecimal,
  formatDecimalCompact,
  formatFixed,
  normalizeNumericInput,
  parseDecimal,
} from "./number";

describe("parseDecimal", () => {
  it("scales by decimals", () => {
    expect(parseDecimal("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    expect(parseDecimal("1", 6)).toBe(1_000_000n);
    expect(parseDecimal("0", 6)).toBe(0n);
  });

  it("pads a short fraction rather than misreading it", () => {
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

describe("formatDecimal ungrouped", () => {
  it("leaves out the thousand separators, with and without decimals", () => {
    expect(formatDecimal(1_234_567_800_000n, 6, false)).toBe("1234567.8");
    expect(formatDecimal(1_000_000n, 0, false)).toBe("1000000");
    expect(formatDecimal(-1_234_500_000n, 6, false)).toBe("-1234.5");
  });
});

describe("formatDecimalCompact", () => {
  it("truncates long fractions to six digits", () => {
    expect(formatDecimalCompact(2_932_815_821_683_550n, 18)).toBe("0.002932");
    expect(formatDecimalCompact(parseDecimal("1234.56789012", 18), 18)).toBe("1,234.56789");
  });

  it("never rounds up", () => {
    expect(formatDecimalCompact(parseDecimal("0.9999999", 18), 18)).toBe("0.999999");
  });

  it("keeps four significant digits for dust below the cap", () => {
    expect(formatDecimalCompact(parseDecimal("0.0000002", 18), 18)).toBe("0.0000002");
    expect(formatDecimalCompact(parseDecimal("0.0001002", 18), 18)).toBe("0.0001002");
  });

  it("drops a fraction that truncates away entirely", () => {
    expect(formatDecimalCompact(parseDecimal("1.0000000002", 18), 18)).toBe("1");
  });

  it("handles negatives and zero decimals", () => {
    expect(formatDecimalCompact(parseDecimal("1.5", 6), 6)).toBe("1.5");
    expect(formatDecimalCompact(-2_932_815_821_683_550n, 18)).toBe("-0.002932");
    expect(formatDecimalCompact(1_234_567n, 0)).toBe("1,234,567");
  });
});

describe("parseDecimal with no fractional units", () => {
  it("rejects a fraction rather than truncating it", () => {
    expect(() => parseDecimal("1.9", 0)).toThrow(/no fractional units/);
    expect(() => parseDecimal("1.0", 0)).toThrow(/no fractional units/);
  });

  it("still accepts whole numbers", () => {
    expect(parseDecimal("19", 0)).toBe(19n);
    expect(parseDecimal("1,234,567", 0)).toBe(1234567n);
  });
});

describe("formatFixed", () => {
  it("pads to two places", () => {
    expect(formatFixed(250_000_000n, 6)).toBe("250.00");
    expect(formatFixed(1_500_000_000_000_000_000n, 18)).toBe("1.50");
    expect(formatFixed(8_420_000_000n, 6)).toBe("8,420.00");
  });

  it("keeps significant digits past the minimum", () => {
    expect(formatFixed(2_500n, 6)).toBe("0.0025");
    expect(formatFixed(1_234_567n, 6)).toBe("1.234567");
  });

  it("caps the fraction at maxFrac, truncating", () => {
    expect(formatFixed(1_239_999n, 6, 2, 2)).toBe("1.23");
    expect(formatFixed(2_418_000_000_000_000_000n, 18, 4, 4)).toBe("2.4180");
  });

  it("does not print dust as zero", () => {
    expect(formatFixed(20_000_000_000n, 18, 2, 6)).toBe("0.00000002");
  });

  it("gives an asset without fractional units no cents", () => {
    expect(formatFixed(250n, 0)).toBe("250");
  });

  it("handles negatives", () => {
    expect(formatFixed(-1_500_000n, 6)).toBe("-1.50");
  });
});

describe("normalizeNumericInput", () => {
  it("strips the grouping a user may type, and surrounding space", () => {
    expect(normalizeNumericInput(" 1,234_567.5 ")).toBe("1234567.5");
    expect(normalizeNumericInput("1,234,567")).toBe("1234567");
  });

  it("reads a lone comma as the decimal point where it cannot be grouping", () => {
    for (const decimalComma of [false, true]) {
      expect(normalizeNumericInput("0,5", decimalComma)).toBe("0.5");
      expect(normalizeNumericInput("1,5", decimalComma)).toBe("1.5");
      expect(normalizeNumericInput("12,25", decimalComma)).toBe("12.25");
      expect(normalizeNumericInput("0,500", decimalComma)).toBe("0.500");
      expect(normalizeNumericInput("1,2345", decimalComma)).toBe("1.2345");
    }
  });

  it("takes the last separator as the decimal point when both are present", () => {
    expect(normalizeNumericInput("1,234.56")).toBe("1234.56");
    expect(normalizeNumericInput("1.234,56")).toBe("1234.56");
    expect(normalizeNumericInput("1.234.567,8")).toBe("1234567.8");
  });

  it("reads the grouped-thousand shape by the locale's convention", () => {
    expect(normalizeNumericInput("1,234", false)).toBe("1234");
    expect(normalizeNumericInput("123,456", false)).toBe("123456");
    expect(normalizeNumericInput("1,234", true)).toBe("1.234");
  });
});
