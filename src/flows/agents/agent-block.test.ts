import { describe, expect, it } from "vitest";
import { type TopUpBlockInput, topUpSubmitBlock } from "./agent-block";

const VALID = { tooLarge: false, insufficient: false, feeUnknown: false, valid: true };

const READY: TopUpBlockInput = {
  syncErrored: false,
  balancesLoading: false,
  amountValid: true,
  amountReason: undefined,
  feeBlock: undefined,
  feePending: false,
  hasAsset: true,
  typed: true,
  validation: VALID,
};

const block = (over: Partial<TopUpBlockInput>) => topUpSubmitBlock({ ...READY, ...over });

describe("topUpSubmitBlock", () => {
  it("opens for a covered amount with its fee priced", () => {
    expect(block({})).toEqual({ disabled: false });
  });

  it("holds an empty row without a reason", () => {
    expect(
      block({ typed: false, amountValid: false, amountReason: "Enter an amount you hold" }),
    ).toEqual({ disabled: true });
  });

  it("names a network with nothing to send before anything is typed", () => {
    expect(block({ hasAsset: false, typed: false }).reason).toBe("No assets on this network");
  });

  it("gives the text's own reason, else the limit the amount is over", () => {
    expect(block({ amountValid: false, amountReason: "Enter the amount as a number" }).reason).toBe(
      "Enter the amount as a number",
    );
    expect(
      block({ amountValid: false, validation: { ...VALID, insufficient: true, valid: false } })
        .reason,
    ).toBe("More than you hold");
  });

  it("waits on the fee once the amount stands", () => {
    expect(block({ feePending: true }).disabled).toBe(true);
  });
});
