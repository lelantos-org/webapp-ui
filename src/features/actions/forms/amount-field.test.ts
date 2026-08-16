import { describe, expect, it } from "vitest";
import { PUBLIC_IN_MAX } from "@/shared/lib/format";
import {
  type AssetMeta,
  formatBalance,
  parseAmountSafe,
  pickAmountError,
  validateAmount,
  validateDepositAmount,
} from "./amount-field";

const WETH: AssetMeta = { decimals: 18, scale: 10n ** 12n, symbol: "WETH" };

describe("parseAmountSafe", () => {
  it("parses into circuit units", () => {
    expect(parseAmountSafe("1", WETH)).toBe(1_000_000n);
  });

  it("returns undefined for partial input rather than throwing", () => {
    // The user is mid-type; the form must still render.
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
      valid: true,
    });
  });

  it("flags an amount above the balance", () => {
    const v = validateAmount(101n, WETH, 100n);
    expect(v.insufficient).toBe(true);
    expect(v.valid).toBe(false);
  });

  it("treats an exactly-equal balance as spendable", () => {
    expect(validateAmount(100n, WETH, 100n).valid).toBe(true);
  });

  it("flags an amount over the uint48 publicIn cap", () => {
    const v = validateAmount(PUBLIC_IN_MAX + 1n, WETH, PUBLIC_IN_MAX * 2n);
    expect(v.tooLarge).toBe(true);
    expect(v.valid).toBe(false);
  });

  it("skips the balance check when no balance is known", () => {
    expect(validateAmount(999n, WETH, undefined).valid).toBe(true);
  });
});

describe("pickAmountError", () => {
  const clean = { tooLarge: false, insufficient: false, valid: true };

  it("prefers the form error over derived ones", () => {
    const both = { tooLarge: true, insufficient: true, valid: false };
    expect(pickAmountError("required", both)).toBe("required");
  });

  it("reports the cap before the balance", () => {
    const both = { tooLarge: true, insufficient: true, valid: false };
    expect(pickAmountError(undefined, both)).toBe("amount exceeds asset cap");
  });

  it("reports an insufficient balance", () => {
    expect(pickAmountError(undefined, { ...clean, insufficient: true, valid: false })).toBe(
      "exceeds available balance",
    );
  });

  it("returns undefined when nothing is wrong", () => {
    expect(pickAmountError(undefined, clean)).toBeUndefined();
  });
});

describe("formatBalance", () => {
  it("renders circuit units back as a decimal string", () => {
    expect(formatBalance(1_000_000n, WETH)).toBe("1");
    expect(formatBalance(1_500_000n, WETH)).toBe("1.5");
  });
});

describe("validateDepositAmount", () => {
  // 1 WETH = 1e6 circuit units = 1e18 base units.
  const ONE = 1_000_000n;
  const ONE_BASE = ONE * WETH.scale;

  it("accepts an amount the wallet balance covers", () => {
    expect(validateDepositAmount(ONE, WETH, ONE_BASE, undefined)).toEqual({
      tooLarge: false,
      insufficient: false,
      valid: true,
    });
  });

  it("compares in base units, not circuit units", () => {
    // The raw circuit amount (1e6) is far below the base balance (1e18), so a
    // unit-blind comparison would wrongly accept 1000 WETH against 1 WETH.
    const v = validateDepositAmount(1000n * ONE, WETH, ONE_BASE, undefined);
    expect(v.insufficient).toBe(true);
    expect(v.valid).toBe(false);
  });

  it("counts the fee, which a deposit adds on top of the amount", () => {
    // Exactly the balance in amount, but the fee pushes the debit over it.
    const total = ONE_BASE + 1n;
    const v = validateDepositAmount(ONE, WETH, ONE_BASE, total);
    expect(v.insufficient).toBe(true);
    expect(v.valid).toBe(false);
  });

  it("holds off until the balance is known", () => {
    expect(validateDepositAmount(ONE, WETH, undefined, undefined).valid).toBe(true);
  });

  it("keeps reporting the asset cap regardless of balance", () => {
    const v = validateDepositAmount(PUBLIC_IN_MAX + 1n, WETH, ONE_BASE, undefined);
    expect(v.tooLarge).toBe(true);
    expect(v.valid).toBe(false);
  });

  it("stays invalid for a non-positive amount", () => {
    expect(validateDepositAmount(0n, WETH, ONE_BASE, undefined).valid).toBe(false);
  });
});
