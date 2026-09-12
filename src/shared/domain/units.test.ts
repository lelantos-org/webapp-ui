import { RAY } from "@lelantos-org/sdk/core";
import { describe, expect, it } from "vitest";
import { formatAmountForAsset } from "@/shared/lib/format/asset";
import {
  baseUnitsUsd,
  exceedsPublicInLimit,
  PUBLIC_IN_MAX,
  parseAmountForAsset,
  usdValue,
} from "./units";

describe("parseAmountForAsset", () => {
  // scale is the circuit→base multiplier: base = circuit * scale.
  it("divides base units down to circuit units", () => {
    expect(parseAmountForAsset("1", 18, 10n ** 12n, RAY)).toBe(1_000_000n);
  });

  it("passes through when scale is 1", () => {
    expect(parseAmountForAsset("1.5", 6, 1n, RAY)).toBe(1_500_000n);
  });

  it("rejects precision the asset cannot represent", () => {
    // 1 wei at scale 10^12 is not a whole circuit unit.
    expect(() => parseAmountForAsset("0.000000000000000001", 18, 10n ** 12n, RAY)).toThrow(
      /precision exceeds asset granularity/,
    );
  });

  it("round-trips through formatAmountForAsset", () => {
    const scale = 10n ** 12n;
    const circuit = parseAmountForAsset("2.5", 18, scale, RAY);
    expect(formatAmountForAsset(circuit, { decimals: 18, scale, index: RAY })).toBe("2.5");
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

describe("usdValue", () => {
  it("converts base units through decimals", () => {
    // 1.5 USDC at $0.99.
    expect(usdValue(1_500_000n, 6, 1n, 0.99, RAY)).toBeCloseTo(1.485, 9);
  });

  it("applies scale before decimals", () => {
    // Balances are circuit units. With scale 10^12 and 18 decimals, 2_000_000n
    // circuit units is 2 whole tokens; ignoring scale would report $0.000006.
    expect(usdValue(2_000_000n, 18, 10n ** 12n, 3000, RAY)).toBeCloseTo(6000, 6);
  });

  it("keeps the integer part of an 18-decimal balance", () => {
    // 1_234_567 WETH in base units is ~1.23e24, far past MAX_SAFE_INTEGER.
    // Converting the bigint whole would round the dollars away.
    const usd = usdValue(1_234_567n * 10n ** 18n, 18, 1n, 2, RAY);
    expect(usd).toBeCloseTo(2_469_134, 0);
  });

  it("handles an asset with no fractional units", () => {
    expect(usdValue(7n, 0, 1n, 3, RAY)).toBe(21);
  });

  it("returns zero for a zero balance", () => {
    expect(usdValue(0n, 18, 1n, 3000, RAY)).toBe(0);
  });
});

// A yield asset's unit count never moves; what it is worth does. These pin the
// user-visible consequence — the same balance reads larger once the venue has
// earned — and the round trip that keeps an amount field honest.
describe("yield index conversions", () => {
  // 1.1 × RAY: the venue has earned 10%.
  const INDEX = (RAY * 11n) / 10n;

  it("renders the same circuit balance larger once the index has moved", () => {
    const flat = formatAmountForAsset(1_000_000n, { decimals: 6, scale: 1n, index: RAY });
    const earned = formatAmountForAsset(1_000_000n, { decimals: 6, scale: 1n, index: INDEX });
    expect(flat).toBe("1");
    expect(earned).toBe("1.1");
  });

  // An exact round trip, and it has to be: the "max" button and the
  // denomination chips both write a formatted amount into the field and have it
  // read straight back. Losing a unit there means max means `max - 1` and a
  // chip's amount is not on the ladder it was drawn from.
  it("reads a formatted amount back as exactly what it was", () => {
    for (const scale of [1n, 100n]) {
      for (const units of [1n, 7n, 1_000_000n, 123_456_789n]) {
        const text = formatAmountForAsset(units, { decimals: 6, scale: scale, index: INDEX });
        expect(parseAmountForAsset(text, 6, scale, INDEX)).toBe(units);
      }
    }
  });

  // The whole balance is the case that has to survive, since it is what the max
  // button writes. One unit is the one that used to round to zero, leaving the
  // field full and the submit button dead with nothing said about why.
  it("keeps a one-unit balance spendable", () => {
    const text = formatAmountForAsset(1n, { decimals: 6, scale: 1n, index: INDEX });
    expect(parseAmountForAsset(text, 6, 1n, INDEX)).toBe(1n);
  });

  // Rounding up recovers the unit count, but it must not conjure one the
  // balance cannot cover: an amount at or below the formatted balance always
  // reads back within it.
  it("never reads back more than the balance it was formatted from", () => {
    const balance = 123_456_789n;
    const text = formatAmountForAsset(balance, { decimals: 6, scale: 1n, index: INDEX });
    expect(parseAmountForAsset(text, 6, 1n, INDEX)).toBeLessThanOrEqual(balance);
  });

  // A plain asset's granularity is fixed, so anything finer was never
  // representable and silently truncating it would short the user.
  it("still rejects an unrepresentable amount on a plain asset", () => {
    expect(() => parseAmountForAsset("0.0000001", 6, 10n, RAY)).toThrow();
  });

  it("values a balance in USD at the index, not at scale", () => {
    const flat = usdValue(1_000_000n, 6, 1n, 2, RAY);
    const earned = usdValue(1_000_000n, 6, 1n, 2, INDEX);
    expect(flat).toBeCloseTo(2, 6);
    expect(earned).toBeCloseTo(2.2, 6);
  });
});

describe("baseUnitsUsd", () => {
  it("is usdValue for an amount already in base units", () => {
    expect(baseUnitsUsd(1_500_000n, 6, 0.99)).toBe(usdValue(1_500_000n, 6, 1n, 0.99, RAY));
    expect(baseUnitsUsd(7n, 0, 3)).toBe(21);
  });
});
