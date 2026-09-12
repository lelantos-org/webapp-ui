import { describe, expect, it } from "vitest";
import { formatBps, formatUsd } from "./money";

describe("formatUsd", () => {
  it("formats a normal amount", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });

  it("reports dust as below a cent rather than as zero", () => {
    // "$0.00" would read as a measured zero; the balance is real but tiny.
    expect(formatUsd(0.0001)).toBe("<$0.01");
  });

  it("still prints an exact zero as zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("rounds a half-cent up rather than calling it dust", () => {
    expect(formatUsd(0.005)).toBe("$0.01");
  });

  it("renders nothing for a non-finite value", () => {
    expect(formatUsd(Number.NaN)).toBe("");
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("formatBps", () => {
  it("renders basis points at the precision asked for", () => {
    expect(formatBps(30n, 2)).toBe("0.30%");
    expect(formatBps(150, 1)).toBe("1.5%");
  });
});
