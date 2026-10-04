import { describe, expect, it } from "vitest";
import { FEE_PENDING_REASON, type FeeBlock, feeBlockReason } from "@/features/fees";
import {
  amountBlock,
  amountTextReason,
  blockedBy,
  ENTER_AMOUNT_REASON,
  feeBlockTail,
  reviewBlockReason,
  SUBMIT_OPEN,
  walletReadinessBlock,
} from "./submit-block";

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
    expect(amountBlock({ amountValid: true, amountReason: undefined })).toBeUndefined();
  });

  it("asks for an amount nobody has typed", () => {
    expect(amountBlock({ amountValid: false, amountReason: "Enter an amount you hold" })).toEqual(
      blockedBy("Enter an amount you hold"),
    );
  });

  it("holds an entered amount the field already flags, without a second sentence", () => {
    expect(amountBlock({ amountValid: false, amountReason: undefined })).toEqual({
      disabled: true,
    });
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

describe("amountTextReason", () => {
  it("asks for an amount that is missing, zero or still being typed", () => {
    expect(amountTextReason("", undefined, "USDC")).toBe(ENTER_AMOUNT_REASON);
    expect(amountTextReason("0", 0n, "USDC")).toBe(ENTER_AMOUNT_REASON);
    expect(amountTextReason("12.", undefined, "USDC")).toBe(ENTER_AMOUNT_REASON);
  });

  it("names input the field cannot flag", () => {
    expect(amountTextReason("0.0000001", undefined, "USDC")).toBe(
      "USDC can't be split that finely",
    );
    expect(amountTextReason("abc", undefined, "USDC")).toBe("Enter the amount as a number");
    expect(amountTextReason("1e3", undefined, "USDC")).toBe("Enter the amount as a number");
  });

  it("is silent for an amount that parses", () => {
    expect(amountTextReason("1.5", 1_500_000n, "USDC")).toBeUndefined();
  });
});

describe("reviewBlockReason", () => {
  it("lets a clear review confirm once its fees are priced", () => {
    expect(reviewBlockReason(SUBMIT_OPEN, true)).toBeUndefined();
    expect(reviewBlockReason(SUBMIT_OPEN, false)).toBe(FEE_PENDING_REASON);
  });

  it("holds the confirm under any block, with or without a reason of its own", () => {
    expect(reviewBlockReason(blockedBy("Enter a recipient address"), true)).toBe(
      "Enter a recipient address",
    );
    expect(reviewBlockReason(blockedBy(), true)).toMatch(/no longer be sent/);
  });
});
