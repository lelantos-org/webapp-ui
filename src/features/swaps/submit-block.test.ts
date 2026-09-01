import { describe, expect, it } from "vitest";
import { type SwapSubmitState, swapSubmitBlock } from "./submit-block";

const ready: SwapSubmitState = {
  amountValid: true,
  hasQuote: true,
  quoteStale: false,
  quoting: false,
};

describe("swapSubmitBlock", () => {
  it("allows submission when nothing blocks it", () => {
    expect(swapSubmitBlock(ready)).toEqual({ disabled: false });
  });

  it.each([
    ["an invalid amount", { amountValid: false }, "enter an amount you hold"],
    ["a quote in flight", { hasQuote: false, quoting: true }, "fetching a quote…"],
    ["an expired quote", { quoteStale: true }, "the quote expired — refresh it"],
    ["no quote yet", { hasQuote: false }, "waiting for a quote"],
  ])("explains %s", (_label, over, reason) => {
    expect(swapSubmitBlock({ ...ready, ...over })).toEqual({ disabled: true, reason });
  });

  // The ordering is the point of this module: each pair below would report the
  // wrong one of two simultaneously-true conditions if the branches were
  // reordered.
  describe("precedence", () => {
    it("reports the amount before anything the amount causes", () => {
      // An unusable amount is why there is no quote — reporting the quote would
      // send the user looking at the wrong control.
      const block = swapSubmitBlock({ ...ready, amountValid: false, hasQuote: false });

      expect(block.reason).toBe("enter an amount you hold");
    });

    it("reports a fetch in flight rather than the absence it causes", () => {
      const block = swapSubmitBlock({ ...ready, hasQuote: false, quoting: true });

      expect(block.reason).toBe("fetching a quote…");
    });

    it("reports staleness rather than absence when a quote expired in place", () => {
      // `quote` is suppressed once stale, so both are true at once. "Expired"
      // has a remedy; "waiting" implies something is still coming.
      const block = swapSubmitBlock({ ...ready, hasQuote: false, quoteStale: true });

      expect(block.reason).toBe("the quote expired — refresh it");
    });

    it("still reports the amount when every condition is against it", () => {
      const block = swapSubmitBlock({
        amountValid: false,
        hasQuote: false,
        quoteStale: true,
        quoting: true,
      });

      expect(block.reason).toBe("enter an amount you hold");
    });
  });
});
