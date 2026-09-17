import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import type { FeeBlock } from "@/features/fees";
import { makeAsset } from "@/test/fixtures/assets";
import { type DepositBlockInput, depositSubmitBlock } from "./deposit-block";

const ok = { tooLarge: false, insufficient: false, feeUnknown: false, valid: true };
const pending = { ...ok, feeUnknown: true, valid: false };
const noSetup = {
  applicable: true,
  needsSetup: false,
  unknown: false,
  blocked: false,
  symbols: ["USDC"],
};
const DAI = makeAsset(3n, "DAI");

type AmountInput = DepositBlockInput["amount"];
const amountOf = (over: Partial<AmountInput> = {}): AmountInput => ({
  parsed: 100n,
  validation: ok,
  feeFailed: false,
  relayerProblem: undefined,
  separateFee: undefined,
  ...over,
});
const block = (over: Partial<DepositBlockInput> = {}) =>
  depositSubmitBlock({
    symbol: "USDC",
    amountText: "100",
    amount: amountOf(),
    setup: noSetup,
    feeBlock: undefined,
    ...over,
  });
const input = (over: Partial<DepositBlockInput> = {}) => block(over).reason;

const shortfall = (symbol: string): FeeBlock => ({
  kind: "shortfall",
  id: 3n,
  symbol,
  decimals: 18,
  scale: 1n,
  index: RAY,
  amount: 10n ** 18n,
  balance: 10n ** 17n,
  alternative: undefined,
});

describe("depositSubmitBlock reason", () => {
  it("is silent for a form that can go", () => {
    expect(input()).toBeUndefined();
  });

  it("asks for an amount first", () => {
    expect(input({ amountText: "" })).toBe("Enter an amount you hold");
    const partial = amountOf({ parsed: undefined, validation: { ...ok, valid: false } });
    expect(input({ amountText: "1.", amount: partial })).toBe("Enter an amount you hold");
  });

  it("leaves an over-balance amount to the field's own error", () => {
    const over = { ...ok, insufficient: true, valid: false };
    expect(input({ amount: amountOf({ validation: over }) })).toBeUndefined();
  });

  it("names input the field cannot flag", () => {
    const bad = amountOf({ parsed: undefined, validation: { ...ok, valid: false } });
    expect(input({ amountText: "0.0000001", amount: bad })).toBe("USDC can't be split that finely");
    expect(input({ amountText: "abc", amount: bad })).toBe("Enter the amount as a number");
  });

  it("puts a fixable fee or setup problem ahead of waiting on the fee", () => {
    expect(
      input({ amount: amountOf({ validation: pending, relayerProblem: "quote-failed" }) }),
    ).toBe("Couldn't get the relayer's fee — try again");
    expect(
      input({
        amount: amountOf({ validation: pending }),
        setup: { ...noSetup, needsSetup: true, blocked: true },
      }),
    ).toBe("Set up USDC first");
    expect(input({ amount: amountOf({ validation: pending }) })).toBe("Working out the fee…");
  });

  it("ignores setup on a path that has none", () => {
    expect(
      input({
        setup: { ...noSetup, applicable: false, needsSetup: true, unknown: true, blocked: true },
      }),
    ).toBeUndefined();
  });
});

describe("depositSubmitBlock reason with a fee in another token", () => {
  const cross = amountOf({ separateFee: DAI });

  it("names the fee token the public wallet cannot cover", () => {
    expect(block({ amount: cross, feeBlock: shortfall("DAI") })).toEqual({
      disabled: true,
      reason: "Not enough DAI in your wallet for the relayer fee",
    });
  });

  it("names the fee token the relayer does not take", () => {
    expect(input({ amount: { ...cross, relayerProblem: "not-accepted" } })).toBe(
      "The relayer doesn't take DAI for its fee right now",
    );
    expect(input({ amount: amountOf({ relayerProblem: "not-accepted" }) })).toBe(
      "The relayer doesn't take USDC deposits right now",
    );
  });

  it("names every token setup is for", () => {
    expect(
      input({ setup: { ...noSetup, needsSetup: true, blocked: true, symbols: ["DAI"] } }),
    ).toBe("Set up DAI first");
    expect(
      input({ setup: { ...noSetup, unknown: true, blocked: true, symbols: ["USDC", "DAI"] } }),
    ).toBe("Couldn't check approvals for USDC and DAI — run setup");
    expect(input({ setup: { ...noSetup, unknown: true, blocked: true } })).toBe(
      "Couldn't check USDC's approval — run setup",
    );
  });
});

describe("depositSubmitBlock disabled", () => {
  it("is live for a form that can go", () => {
    expect(block()).toEqual({ disabled: false });
  });

  it("holds an over-balance amount without a second sentence", () => {
    const over = { ...ok, insufficient: true, valid: false };
    expect(block({ amount: amountOf({ validation: over }) })).toEqual({ disabled: true });
  });

  it("holds on setup and on a relayer that cannot be paid", () => {
    expect(block({ setup: { ...noSetup, blocked: true } }).disabled).toBe(true);
    expect(
      block({ feeBlock: { kind: "not-accepted", symbol: "DAI", alternative: undefined } }).disabled,
    ).toBe(true);
  });
});
