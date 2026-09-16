import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import { formatAmountForAsset, parseAmountInput } from "./asset";

const plain = (decimals: number, scale: bigint) => ({ decimals, scale, index: RAY });

describe("parseAmountInput", () => {
  // scale is the circuit→base multiplier: base = circuit * scale.
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
    // 1 wei at scale 10^12 is not a whole circuit unit.
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

// A yield asset's unit count never moves; what it is worth does. These pin the
// user-visible consequence — the same balance reads larger once the venue has
// earned — and the round trip that keeps an amount field honest.
describe("yield index conversions", () => {
  // 1.1 × RAY: the venue has earned 10%.
  const INDEX = (RAY * 11n) / 10n;

  it("renders the same circuit balance larger once the index has moved", () => {
    expect(formatAmountForAsset(1_000_000n, { decimals: 6, scale: 1n, index: RAY })).toBe("1");
    expect(formatAmountForAsset(1_000_000n, { decimals: 6, scale: 1n, index: INDEX })).toBe("1.1");
  });

  // An exact round trip, and it has to be: the "max" button and the
  // denomination chips both write a formatted amount into the field and have it
  // read straight back. Losing a unit there means max means `max - 1` and a
  // chip's amount is not on the ladder it was drawn from.
  it("reads a formatted amount back as exactly what it was", () => {
    for (const scale of [1n, 100n]) {
      const asset = { decimals: 6, scale, index: INDEX };
      for (const units of [1n, 7n, 1_000_000n, 123_456_789n]) {
        expect(parseAmountInput(formatAmountForAsset(units, asset), asset)).toBe(units);
      }
    }
  });

  // The whole balance is the case that has to survive, since it is what the max
  // button writes. One unit is the one that used to round to zero, leaving the
  // field full and the submit button dead with nothing said about why.
  it("keeps a one-unit balance spendable", () => {
    const asset = { decimals: 6, scale: 1n, index: INDEX };
    expect(parseAmountInput(formatAmountForAsset(1n, asset), asset)).toBe(1n);
  });

  // Rounding up recovers the unit count, but it must not conjure one the
  // balance cannot cover: an amount at or below the formatted balance always
  // reads back within it.
  it("never reads back more than the balance it was formatted from", () => {
    const asset = { decimals: 6, scale: 1n, index: INDEX };
    const balance = 123_456_789n;
    expect(parseAmountInput(formatAmountForAsset(balance, asset), asset)).toBeLessThanOrEqual(
      balance,
    );
  });

  // A plain asset's granularity is fixed, so anything finer was never
  // representable and silently truncating it would short the user.
  it("still rejects an unrepresentable amount on a plain asset", () => {
    expect(() => parseAmountInput("0.00001", plain(6, 100n))).toThrow();
  });
});
