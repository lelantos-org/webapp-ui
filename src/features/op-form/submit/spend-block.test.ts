import { describe, expect, it } from "vitest";
import type { FeeBlock } from "@/features/fees";
import { type SpendBlockInput, spendSubmitBlock } from "./spend-block";

const QUOTE_FAILED: FeeBlock = { kind: "quote-failed", error: new Error("x"), retry: () => {} };

const ok = (over: Partial<SpendBlockInput> = {}): SpendBlockInput => ({
  syncErrored: false,
  balancesLoading: false,
  amountValid: true,
  amountReason: undefined,
  recipient: "lel1validaddress",
  recipientRule: {
    problem: (v: string) => (v.startsWith("lel1") ? undefined : "That is not a shielded address"),
  },
  feePending: false,
  feeBlock: undefined,
  ...over,
});

const reason = (over: Partial<SpendBlockInput>) => spendSubmitBlock(ok(over)).reason;

describe("spendSubmitBlock", () => {
  it("lets a complete form through", () => {
    expect(spendSubmitBlock(ok())).toEqual({ disabled: false });
  });

  it("pauses sending while the balances are stale", () => {
    expect(reason({ syncErrored: true })).toMatch(/— sending is paused/);
  });

  it("gates an empty recipient, which used to reach zod only after the click", () => {
    expect(reason({ recipient: "   " })).toBe("Enter a recipient address");
  });

  it("gates a memo too long to send, after the recipient, and leaves the reason to the field", () => {
    expect(spendSubmitBlock(ok({ memo: "" }))).toEqual({ disabled: false });
    expect(spendSubmitBlock(ok({ memo: "rent, October" }))).toEqual({ disabled: false });
    expect(spendSubmitBlock(ok({ memo: "a".repeat(129) }))).toEqual({ disabled: true });
    expect(reason({ memo: "a".repeat(129), recipient: "" })).toBe("Enter a recipient address");
  });

  it("names the kind of address a malformed recipient is not", () => {
    expect(reason({ recipient: "0xdeadbeef" })).toBe("That is not a shielded address");
    expect(
      reason({
        recipient: "lel1abc",
        recipientRule: { problem: () => "That is not a valid public address" },
      }),
    ).toBe("That is not a valid public address");
  });

  it("holds an amount the field flags without a second sentence", () => {
    expect(spendSubmitBlock(ok({ amountValid: false, amountReason: undefined }))).toEqual({
      disabled: true,
    });
  });

  it.each<[string, Partial<SpendBlockInput>, string]>([
    [
      "the sync before anything the user could otherwise fix",
      {
        balancesLoading: true,
        recipient: "",
        amountValid: false,
        amountReason: "Enter an amount you hold",
      },
      "Still adding up your balance",
    ],
    [
      "the amount before the recipient",
      { amountValid: false, amountReason: "Enter an amount you hold", recipient: "" },
      "Enter an amount you hold",
    ],
    [
      "the user's own input before the fee problem",
      { recipient: "", feeBlock: QUOTE_FAILED, feePending: true },
      "Enter a recipient address",
    ],
    ["a pending fee last", { feePending: true }, "Working out the fee…"],
  ])("reports %s", (_label, over, expected) => {
    expect(reason(over)).toBe(expected);
  });
});
