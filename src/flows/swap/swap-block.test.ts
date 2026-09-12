// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { FeeBlock } from "@/features/fees";
import { type SwapSubmitState, swapSubmitBlock } from "./swap-block";

const ready: SwapSubmitState = {
  syncErrored: false,
  balancesLoading: false,
  hasPair: true,
  amountValid: true,
  amountEntered: true,
  hasQuote: true,
  quoteStale: false,
  quoting: false,
  quoteFailed: false,
  feeBlock: undefined,
  feePending: false,
};

const QUOTE_FAILED: FeeBlock = { kind: "quote-failed", error: new Error("x"), retry: () => {} };

describe("swapSubmitBlock", () => {
  it("allows submission when nothing blocks it", () => {
    expect(swapSubmitBlock(ready)).toEqual({ disabled: false });
  });

  // The shared questions' wording is pinned in `op-form/submit-block.test.ts`;
  // these are the swap's own.
  it.each<[string, Partial<SwapSubmitState>, string]>([
    [
      "a failed sync, naming the swap",
      { syncErrored: true },
      "Balances are out of date — swapping is paused until the wallet catches up",
    ],
    ["a network with nothing to trade", { hasPair: false }, "No assets on this network"],
    ["a quote in flight", { hasQuote: false, quoting: true }, "Fetching a quote…"],
    ["an expired quote", { quoteStale: true }, "The quote expired — refresh it"],
    ["a failed quote", { hasQuote: false, quoteFailed: true }, "Couldn't get a quote — try again"],
    ["no quote yet", { hasQuote: false }, "Waiting for a quote"],
    ["a fee still pricing", { feePending: true }, "Working out the fee…"],
  ])("explains %s", (_label, over, reason) => {
    expect(swapSubmitBlock({ ...ready, ...over })).toEqual({ disabled: true, reason });
  });

  it("stays quiet about an amount that is already flagged under the field", () => {
    expect(swapSubmitBlock({ ...ready, amountValid: false })).toEqual({ disabled: true });
  });

  // The ordering is the point of this module: each pair below would report the
  // wrong one of two simultaneously-true conditions if the branches were
  // reordered.
  describe("precedence", () => {
    it("reads the wallet before judging the amount against it", () => {
      const block = swapSubmitBlock({ ...ready, balancesLoading: true, amountValid: false });

      expect(block.reason).toBe("Still adding up your balance");
    });

    it("reports the amount before anything the amount causes", () => {
      // An unusable amount is why there is no quote — reporting the quote would
      // send the user looking at the wrong control.
      const block = swapSubmitBlock({
        ...ready,
        amountValid: false,
        amountEntered: false,
        hasQuote: false,
      });

      expect(block.reason).toBe("Enter an amount you hold");
    });

    it("reports staleness rather than absence when a quote expired in place", () => {
      // `quote` is suppressed once stale, so both are true at once. "Expired"
      // has a remedy; "waiting" implies something is still coming.
      const block = swapSubmitBlock({ ...ready, hasQuote: false, quoteStale: true });

      expect(block.reason).toBe("The quote expired — refresh it");
    });

    it("reports the quote before the fee", () => {
      // No quote means no trade to pay a fee on yet.
      const block = swapSubmitBlock({ ...ready, hasQuote: false, feeBlock: QUOTE_FAILED });

      expect(block.reason).toBe("Waiting for a quote");
    });
  });
});
