import { circuitAmount } from "@lelantos-org/sdk";
import { PUBLIC_IN_MAX, RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import { feeBreakdown } from "@/shared/domain/fee-math";
import { asBaseUnits } from "@/shared/domain/units";
import {
  type AssetMeta,
  depositMaxAmount,
  parseAmountSafe,
  pickAmountError,
  validateAmount,
  validateDepositAmount,
} from "./amount-validation";

const WETH: AssetMeta = { decimals: 18, scale: 10n ** 12n, index: RAY, symbol: "WETH" };

describe("parseAmountSafe", () => {
  it("parses into circuit units", () => {
    expect(parseAmountSafe("1", WETH)).toBe(1_000_000n);
  });

  it("returns undefined for partial input rather than throwing", () => {
    for (const partial of ["", ".", "1.", "abc", "-1"]) {
      expect(parseAmountSafe(partial, WETH), partial).toBeUndefined();
    }
  });

  it("returns undefined when precision exceeds asset granularity", () => {
    expect(parseAmountSafe("0.000000000000000001", WETH)).toBeUndefined();
  });

  it("returns undefined with no asset selected", () => {
    expect(parseAmountSafe("1", undefined)).toBeUndefined();
  });
});

describe("validateAmount", () => {
  it("is invalid with no amount, no asset, or a non-positive amount", () => {
    expect(validateAmount(undefined, WETH, 100n).valid).toBe(false);
    expect(validateAmount(1n, undefined, 100n).valid).toBe(false);
    expect(validateAmount(0n, WETH, 100n).valid).toBe(false);
    expect(validateAmount(-1n, WETH, 100n).valid).toBe(false);
  });

  it("accepts an amount covered by the balance", () => {
    expect(validateAmount(50n, WETH, 100n)).toEqual({
      tooLarge: false,
      insufficient: false,
      feeUnknown: false,
      valid: true,
    });
  });

  it.each<[string, bigint, bigint | undefined, object]>([
    ["flags an amount above the balance", 101n, 100n, { insufficient: true, valid: false }],
    ["treats an exactly-equal balance as spendable", 100n, 100n, { valid: true }],
    [
      "flags an amount over the uint48 publicIn cap",
      PUBLIC_IN_MAX + 1n,
      PUBLIC_IN_MAX * 2n,
      { tooLarge: true, valid: false },
    ],
    ["skips the balance check when no balance is known", 999n, undefined, { valid: true }],
  ])("%s", (_label, amount, balance, expected) => {
    expect(validateAmount(amount, WETH, balance)).toMatchObject(expected);
  });
});

describe("pickAmountError", () => {
  const clean = { tooLarge: false, insufficient: false, feeUnknown: false, valid: true };

  it("prefers the form error, then the cap, over the balance", () => {
    const both = { tooLarge: true, insufficient: true, feeUnknown: false, valid: false };
    expect(pickAmountError("required", both)).toBe("required");
    expect(pickAmountError(undefined, both)).toBe("More than this asset allows in one transaction");
  });

  it("reports an insufficient balance", () => {
    expect(pickAmountError(undefined, { ...clean, insufficient: true, valid: false })).toBe(
      "More than you hold",
    );
  });

  it("returns undefined when nothing is wrong", () => {
    expect(pickAmountError(undefined, clean)).toBeUndefined();
  });
});

describe("validateDepositAmount", () => {
  const ONE = 1_000_000n;
  const ONE_BASE = asBaseUnits(ONE * WETH.scale);

  it("accepts an amount the wallet balance covers once the fee is known", () => {
    expect(validateDepositAmount(ONE, WETH, asBaseUnits(ONE_BASE + 5n), ONE_BASE)).toEqual({
      tooLarge: false,
      insufficient: false,
      feeUnknown: false,
      valid: true,
    });
  });

  it("refuses to validate while the fee is unknown", () => {
    const v = validateDepositAmount(ONE, WETH, ONE_BASE, undefined);
    expect(v.feeUnknown).toBe(true);
    expect(v.valid).toBe(false);
    expect(v.insufficient).toBe(false);
    expect(pickAmountError(undefined, v)).toBeUndefined();
  });

  it("compares in base units, not circuit units", () => {
    const total = asBaseUnits(1000n * ONE * WETH.scale);
    const v = validateDepositAmount(1000n * ONE, WETH, ONE_BASE, total);
    expect(v.insufficient).toBe(true);
    expect(v.valid).toBe(false);
  });

  it("counts the fee, which a deposit adds on top of the amount", () => {
    const total = asBaseUnits(ONE_BASE + 1n);
    const v = validateDepositAmount(ONE, WETH, ONE_BASE, total);
    expect(v.insufficient).toBe(true);
    expect(v.valid).toBe(false);
  });

  it("will not take a circuit amount where base units are due", () => {
    const circuit = circuitAmount(ONE);
    // @ts-expect-error a circuit amount is not a base-unit balance
    const v = validateDepositAmount(ONE, WETH, circuit, ONE_BASE);
    expect(v.insufficient).toBe(true);
  });

  it("holds off on the balance check until the balance is known", () => {
    expect(validateDepositAmount(ONE, WETH, undefined, ONE_BASE).valid).toBe(true);
  });

  it("keeps reporting the asset cap regardless of balance or fee", () => {
    const v = validateDepositAmount(PUBLIC_IN_MAX + 1n, WETH, ONE_BASE, undefined);
    expect(v.tooLarge).toBe(true);
    expect(v.valid).toBe(false);
  });

  it("stays invalid for a non-positive amount", () => {
    expect(validateDepositAmount(0n, WETH, ONE_BASE, ONE_BASE).valid).toBe(false);
  });
});

describe("depositMaxAmount", () => {
  const cost = (amount: bigint, scale: bigint, feeBps: bigint, index: bigint) =>
    feeBreakdown({ amount, scale, index, feeBps, leg: "deposit" }).total;

  it("leaves room for the fee charged on top", () => {
    // `applyFee` truncates, so 998 fits, not the naive 997.
    const max = depositMaxAmount(asBaseUnits(1_000n), 1n, 30n);

    expect(max).toBe(998n);
    expect(cost(998n, 1n, 30n, RAY)).toBe(1_000n);
  });

  it("does not short-change the user where the fee truncates in their favour", () => {
    expect(depositMaxAmount(asBaseUnits(123_456n), 1n, 30n)).toBe(123_087n);
  });

  it("never exceeds the publicIn cap, however large the balance", () => {
    expect(depositMaxAmount(asBaseUnits((PUBLIC_IN_MAX + 1_000n) * 2n), 1n, 0n)).toBe(
      PUBLIC_IN_MAX,
    );
  });

  it("never returns an amount the balance cannot cover", () => {
    for (const balance of [1n, 7n, 999n, 1_000n, 123_456n, 10n ** 18n]) {
      for (const bps of [0n, 1n, 30n, 250n, 9_999n]) {
        const max = depositMaxAmount(asBaseUnits(balance), 1n, bps);
        if (max === undefined) continue;
        expect(cost(max, 1n, bps, RAY)).toBeLessThanOrEqual(balance);
        if (max < PUBLIC_IN_MAX) {
          expect(cost(max + 1n, 1n, bps, RAY)).toBeGreaterThan(balance);
        }
      }
    }
  });

  it("is the whole balance when the chain charges no fee", () => {
    expect(depositMaxAmount(asBaseUnits(1_000n), 1n, 0n)).toBe(1_000n);
  });

  it("floors to the asset's granularity", () => {
    const max = depositMaxAmount(asBaseUnits(1_000n), 100n, 0n);

    expect(max).toBe(10n);
    expect(cost(10n, 100n, 0n, RAY)).toBe(1_000n);
  });

  it("offers nothing without a balance or a fee to size it against", () => {
    expect(depositMaxAmount(undefined, 1n, 30n)).toBeUndefined();
    expect(depositMaxAmount(asBaseUnits(1_000n), 1n, undefined)).toBeUndefined();
  });

  it("offers nothing when the balance is too small to deposit anything", () => {
    expect(depositMaxAmount(asBaseUnits(0n), 1n, 30n)).toBeUndefined();
    expect(depositMaxAmount(asBaseUnits(50n), 100n, 0n)).toBeUndefined();
  });
});
