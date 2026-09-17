import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import { formatAmountForAsset, parseAmountInput } from "./asset";

const plain = (decimals: number, scale: bigint) => ({ decimals, scale, index: RAY });

describe("parseAmountInput", () => {
  it("divides base units down to circuit units", () => {
    expect(parseAmountInput("1", plain(18, 10n ** 12n))).toBe(1_000_000n);
  });

  it("passes through when scale is 1", () => {
    expect(parseAmountInput("1.5", plain(6, 1n))).toBe(1_500_000n);
  });

  it("strips the grouping `formatAmountForAsset` adds", () => {
    expect(parseAmountInput("1,234.5", plain(6, 1n))).toBe(1_234_500_000n);
  });

  it("rejects precision the asset cannot represent", () => {
    expect(() => parseAmountInput("0.000000000000000001", plain(18, 10n ** 12n))).toThrow(
      /precision exceeds asset granularity/,
    );
  });

  it("rejects more fractional digits than the token has, on any asset", () => {
    const grown = { decimals: 6, scale: 1n, index: (RAY * 11n) / 10n };
    expect(() => parseAmountInput("0.0000001", grown)).toThrow(/too many fractional digits/);
  });

  it("rejects malformed input instead of coercing it", () => {
    for (const bad of ["", "abc", "1.2.3", "-1", "1e5", ".5", "1."]) {
      expect(() => parseAmountInput(bad, plain(6, 1n)), bad).toThrow();
    }
  });

  it("round-trips through formatAmountForAsset", () => {
    const asset = plain(18, 10n ** 12n);
    expect(formatAmountForAsset(parseAmountInput("2.5", asset), asset)).toBe("2.5");
  });
});

describe("yield index conversions", () => {
  const INDEX = (RAY * 11n) / 10n;

  it("renders the same circuit balance larger once the index has moved", () => {
    expect(formatAmountForAsset(1_000_000n, { decimals: 6, scale: 1n, index: RAY })).toBe("1");
    expect(formatAmountForAsset(1_000_000n, { decimals: 6, scale: 1n, index: INDEX })).toBe("1.1");
  });

  // The max button and denomination chips write formatted text back into the field.
  it("reads a formatted amount back as exactly what it was", () => {
    for (const scale of [1n, 100n]) {
      const asset = { decimals: 6, scale, index: INDEX };
      for (const units of [1n, 7n, 1_000_000n, 123_456_789n]) {
        expect(parseAmountInput(formatAmountForAsset(units, asset), asset)).toBe(units);
      }
    }
  });

  it("keeps a one-unit balance spendable", () => {
    const asset = { decimals: 6, scale: 1n, index: INDEX };
    expect(parseAmountInput(formatAmountForAsset(1n, asset), asset)).toBe(1n);
  });

  it("never reads back more than the balance it was formatted from", () => {
    const asset = { decimals: 6, scale: 1n, index: INDEX };
    const balance = 123_456_789n;
    expect(parseAmountInput(formatAmountForAsset(balance, asset), asset)).toBeLessThanOrEqual(
      balance,
    );
  });

  it("still rejects an unrepresentable amount on a plain asset", () => {
    expect(() => parseAmountInput("0.00001", plain(6, 100n))).toThrow();
  });
});
