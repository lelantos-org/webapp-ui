import { describe, expect, it } from "vitest";
import { feeBreakdown } from "@/shared/lib/fees";
import { PUBLIC_IN_MAX } from "@/shared/lib/format";
import {
  type AssetMeta,
  depositMaxAmount,
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
      feeUnknown: false,
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
  const clean = { tooLarge: false, insufficient: false, feeUnknown: false, valid: true };

  it("prefers the form error over derived ones", () => {
    const both = { tooLarge: true, insufficient: true, feeUnknown: false, valid: false };
    expect(pickAmountError("required", both)).toBe("required");
  });

  it("reports the cap before the balance", () => {
    const both = { tooLarge: true, insufficient: true, feeUnknown: false, valid: false };
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

  it("accepts an amount the wallet balance covers once the fee is known", () => {
    expect(validateDepositAmount(ONE, WETH, ONE_BASE + 5n, ONE_BASE)).toEqual({
      tooLarge: false,
      insufficient: false,
      feeUnknown: false,
      valid: true,
    });
  });

  it("refuses to validate while the fee is unknown", () => {
    // The fee preview is debounced 300ms and can also error outright, in which
    // case it never arrives. Falling back to the bare amount made the user's
    // whole balance a valid deposit — live button, Permit2 signature, then a
    // `transferFrom` that reverts for `amount + fee` with gas already paid.
    const v = validateDepositAmount(ONE, WETH, ONE_BASE, undefined);
    expect(v.feeUnknown).toBe(true);
    expect(v.valid).toBe(false);
    // Not the user's fault, and nothing for them to fix.
    expect(v.insufficient).toBe(false);
    expect(pickAmountError(undefined, v)).toBeUndefined();
  });

  it("compares in base units, not circuit units", () => {
    // The raw circuit amount (1e6) is far below the base balance (1e18), so a
    // unit-blind comparison would wrongly accept 1000 WETH against 1 WETH.
    const total = 1000n * ONE * WETH.scale;
    const v = validateDepositAmount(1000n * ONE, WETH, ONE_BASE, total);
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
  /// What the deposit actually costs the wallet, in base units.
  const cost = (amount: bigint, scale: bigint, feeBps: bigint) =>
    feeBreakdown({ amount, scale, feeBps, mode: "deposit" }).total;

  it("leaves room for the fee charged on top", () => {
    // 30bps on a 1000-unit balance: depositing all 1000 would need 1003. 998
    // is the answer rather than the naive 997 — `applyFee` truncates, so the
    // fee on 998 is 2, not 2.994.
    const max = depositMaxAmount(1_000n, 1n, 30n);

    expect(max).toBe(998n);
    expect(cost(998n, 1n, 30n)).toBe(1_000n);
  });

  it("does not short-change the user where the fee truncates in their favour", () => {
    // The closed-form inverse lands on 123086, but 123087 also fits once
    // `applyFee`'s truncation is accounted for. Regression: the first version
    // only corrected downwards and left that unit behind.
    expect(depositMaxAmount(123_456n, 1n, 30n)).toBe(123_087n);
  });

  it("never exceeds the publicIn cap, however large the balance", () => {
    // Otherwise "max" writes an amount `validateAmount` rejects on sight.
    expect(depositMaxAmount((PUBLIC_IN_MAX + 1_000n) * 2n, 1n, 0n)).toBe(PUBLIC_IN_MAX);
  });

  it("never returns an amount the balance cannot cover", () => {
    // Swept rather than spot-checked: `applyFee` truncates, so the closed-form
    // inverse can land a unit over for some (balance, bps) pairs and the
    // verify loop is what actually holds the invariant.
    for (const balance of [1n, 7n, 999n, 1_000n, 123_456n, 10n ** 18n]) {
      for (const bps of [0n, 1n, 30n, 250n, 9_999n]) {
        const max = depositMaxAmount(balance, 1n, bps);
        if (max === undefined) continue;
        expect(cost(max, 1n, bps)).toBeLessThanOrEqual(balance);
        // And it is the *largest* such amount, not merely a safe one — unless
        // the publicIn cap is what bounded it rather than the balance.
        if (max < PUBLIC_IN_MAX) {
          expect(cost(max + 1n, 1n, bps)).toBeGreaterThan(balance);
        }
      }
    }
  });

  it("gives back as little as it can", () => {
    // One more unit must not fit, or the button is short-changing the user.
    const balance = 123_456n;
    const max = depositMaxAmount(balance, 1n, 30n);
    if (max === undefined) throw new Error("expected a max");

    expect(cost(max + 1n, 1n, 30n)).toBeGreaterThan(balance);
  });

  it("is the whole balance when the chain charges no fee", () => {
    expect(depositMaxAmount(1_000n, 1n, 0n)).toBe(1_000n);
  });

  it("floors to the asset's granularity", () => {
    // `scale > 1n` means the circuit cannot represent every base unit, and
    // `parseAmountForAsset` rejects an amount that is not a multiple.
    const max = depositMaxAmount(1_000n, 100n, 0n);

    expect(max).toBe(10n);
    expect(cost(10n, 100n, 0n)).toBe(1_000n);
  });

  it("offers nothing without a balance or a fee to size it against", () => {
    expect(depositMaxAmount(undefined, 1n, 30n)).toBeUndefined();
    expect(depositMaxAmount(1_000n, 1n, undefined)).toBeUndefined();
  });

  it("offers nothing when the balance is too small to deposit anything", () => {
    // Below one circuit unit there is no amount to write.
    expect(depositMaxAmount(0n, 1n, 30n)).toBeUndefined();
    expect(depositMaxAmount(50n, 100n, 0n)).toBeUndefined();
  });
});
