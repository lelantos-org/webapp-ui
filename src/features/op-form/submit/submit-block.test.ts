import { describe, expect, it } from "vitest";
import { type FeeBlock, feeBlockReason } from "@/features/fees";
import { amountBlock, blockedBy, feeBlockTail, walletReadinessBlock } from "./submit-block";

const QUOTE_FAILED: FeeBlock = { kind: "quote-failed", error: new Error("x"), retry: () => {} };

describe("blockedBy", () => {
  it("carries a reason only when there is one to show", () => {
    expect(blockedBy("Why")).toEqual({ disabled: true, reason: "Why" });
    expect(blockedBy()).toEqual({ disabled: true });
  });
});

describe("walletReadinessBlock", () => {
  const ready = { syncErrored: false, balancesLoading: false };

  it("passes a wallet with counted, current balances", () => {
    expect(walletReadinessBlock("sending", ready)).toBeUndefined();
  });

  it("pauses the named activity on a failed sync, ahead of one still running", () => {
    expect(
      walletReadinessBlock("swapping", { syncErrored: true, balancesLoading: true })?.reason,
    ).toBe("Balances are out of date — swapping is paused until the wallet catches up");
  });

  it("holds the form while the first sync is still counting", () => {
    expect(walletReadinessBlock("sending", { ...ready, balancesLoading: true })?.reason).toBe(
      "Still adding up your balance",
    );
  });
});

describe("amountBlock", () => {
  it("passes a valid amount", () => {
    expect(amountBlock({ amountValid: true, amountEntered: true })).toBeUndefined();
  });

  it("asks for an amount nobody has typed", () => {
    expect(amountBlock({ amountValid: false, amountEntered: false })).toEqual(
      blockedBy("Enter an amount you hold"),
    );
  });

  it("holds an entered amount the field already flags, without a second sentence", () => {
    expect(amountBlock({ amountValid: false, amountEntered: true })).toEqual({ disabled: true });
  });
});

describe("feeBlockTail", () => {
  it("passes a priced, payable fee", () => {
    expect(feeBlockTail({ feeBlock: undefined, feePending: false })).toBeUndefined();
  });

  it("states a fee problem ahead of a fee still pricing", () => {
    expect(feeBlockTail({ feeBlock: QUOTE_FAILED, feePending: true })).toEqual(
      blockedBy(feeBlockReason(QUOTE_FAILED)),
    );
  });

  it("waits for the fee rather than letting an unpriced spend through", () => {
    expect(feeBlockTail({ feeBlock: undefined, feePending: true })).toEqual(
      blockedBy("Working out the fee…"),
    );
  });
});
