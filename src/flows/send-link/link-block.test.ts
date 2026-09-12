// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { type FeeBlock, feeBlockReason } from "@/features/fees";
import { type LinkBlockInput, linkSubmitBlock } from "./link-block";

const linkBlockedReason = (input: LinkBlockInput) => linkSubmitBlock(input).reason;
const ready: LinkBlockInput = {
  syncErrored: false,
  balancesLoading: false,
  hasAsset: true,
  amountValid: true,
  amountEntered: true,
  vaultFull: false,
  feeBlock: undefined,
  feePending: false,
  acknowledged: true,
};

const QUOTE_FAILED: FeeBlock = { kind: "quote-failed", error: new Error("x"), retry: () => {} };

// The shared questions' wording is pinned in `op-form/submit-block.test.ts`;
// these are the link form's own, and the order it asks everything in.
describe("linkSubmitBlock", () => {
  it("lets a complete form through", () => {
    expect(linkSubmitBlock(ready)).toEqual({ disabled: false });
  });

  it.each<[string, Partial<LinkBlockInput>, string]>([
    ["a network with no assets", { hasAsset: false }, "No assets on this network"],
    [
      "a full vault",
      { vaultFull: true },
      "Export your links first — this one would drop the oldest",
    ],
    [
      "an unticked box",
      { acknowledged: false },
      "Tick the box to confirm you'll share it privately",
    ],
  ])("explains %s", (_label, over, reason) => {
    expect(linkSubmitBlock({ ...ready, ...over })).toEqual({ disabled: true, reason });
  });

  // The regression: the button used to be keyed off the reason alone, and an
  // amount the field already flags has none — so an amount over the balance
  // went live and failed only after a full proof.
  it("holds the button on an entered amount the field flags, without a second sentence", () => {
    expect(linkSubmitBlock({ ...ready, amountValid: false, amountEntered: true })).toEqual({
      disabled: true,
    });
  });

  it("reads the balance before judging the amount against it", () => {
    // Against an uncounted wallet every amount is "more than you hold".
    expect(linkBlockedReason({ ...ready, balancesLoading: true, amountValid: false })).toBe(
      "Still adding up your balance",
    );
  });

  it("names a fee problem before the box, and the box before a fee in flight", () => {
    expect(linkBlockedReason({ ...ready, feeBlock: QUOTE_FAILED, acknowledged: false })).toBe(
      feeBlockReason(QUOTE_FAILED),
    );
    expect(linkBlockedReason({ ...ready, feePending: true, acknowledged: false })).toBe(
      "Tick the box to confirm you'll share it privately",
    );
  });
});
