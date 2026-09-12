import { describe, expect, it } from "vitest";
import { type DepositBlockInput, depositSubmitBlock } from "./deposit-block";

const ok = { tooLarge: false, insufficient: false, feeUnknown: false, valid: true };
const noSetup = { applicable: true, needsSetup: false, unknown: false, blocked: false };
const block = (over: Partial<DepositBlockInput> = {}) =>
  depositSubmitBlock({
    symbol: "USDC",
    amountText: "100",
    amount: { parsed: 100n, validation: ok, feeFailed: false, relayerProblem: undefined },
    setup: noSetup,
    feeBlocked: false,
    ...over,
  });
const input = (over: Partial<DepositBlockInput> = {}) => block(over).reason;

describe("depositSubmitBlock reason", () => {
  it("is silent for a form that can go", () => {
    expect(input()).toBeUndefined();
  });

  it("asks for an amount first", () => {
    expect(input({ amountText: "" })).toBe("Enter an amount you hold");
    const partial = {
      parsed: undefined,
      validation: { ...ok, valid: false },
      feeFailed: false,
      relayerProblem: undefined,
    };
    expect(input({ amountText: "1.", amount: partial })).toBe("Enter an amount you hold");
  });

  it("leaves an over-balance amount to the field's own error", () => {
    const over = { ...ok, insufficient: true, valid: false };
    expect(
      input({
        amount: { parsed: 100n, validation: over, feeFailed: false, relayerProblem: undefined },
      }),
    ).toBeUndefined();
  });

  it("names input the field cannot flag", () => {
    const bad = {
      parsed: undefined,
      validation: { ...ok, valid: false },
      feeFailed: false,
      relayerProblem: undefined,
    };
    expect(input({ amountText: "0.0000001", amount: bad })).toBe("USDC can't be split that finely");
    expect(input({ amountText: "abc", amount: bad })).toBe("Enter the amount as a number");
  });

  it("puts a fixable fee or setup problem ahead of waiting on the fee", () => {
    const pending = { ...ok, feeUnknown: true, valid: false };
    expect(
      input({
        amount: {
          parsed: 100n,
          validation: pending,
          feeFailed: false,
          relayerProblem: "quote-failed",
        },
      }),
    ).toBe("Couldn't get the relayer's fee — try again");
    expect(
      input({
        amount: { parsed: 100n, validation: pending, feeFailed: false, relayerProblem: undefined },
        setup: { ...noSetup, needsSetup: true, blocked: true },
      }),
    ).toBe("Set up USDC first");
    expect(
      input({
        amount: { parsed: 100n, validation: pending, feeFailed: false, relayerProblem: undefined },
      }),
    ).toBe("Working out the fee…");
  });

  it("ignores setup on a path that has none", () => {
    expect(
      input({ setup: { applicable: false, needsSetup: true, unknown: true, blocked: true } }),
    ).toBeUndefined();
  });
});

describe("depositSubmitBlock disabled", () => {
  it("is live for a form that can go", () => {
    expect(block()).toEqual({ disabled: false });
  });

  it("holds an over-balance amount without a second sentence", () => {
    const over = { ...ok, insufficient: true, valid: false };
    expect(
      block({
        amount: { parsed: 100n, validation: over, feeFailed: false, relayerProblem: undefined },
      }),
    ).toEqual({ disabled: true });
  });

  it("holds on setup and on a relayer that cannot be paid", () => {
    expect(block({ setup: { ...noSetup, blocked: true } }).disabled).toBe(true);
    expect(block({ feeBlocked: true }).disabled).toBe(true);
  });
});
