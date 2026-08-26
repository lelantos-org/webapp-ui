import { describe, expect, it } from "vitest";
import type { FeeBreakdown } from "@/shared/lib/fees";
import type { FeePreviewResult } from "../use-fee-preview";
import { joinHint, settledFee } from "./fee-hint";

function breakdown(fee: bigint, total: bigint, feeBps = 30n): FeeBreakdown {
  return { inAmt: 1_000_000n, fee, total, feeBps, mode: "deposit" };
}

/// Only the two fields `settledFee` reads; the rest of `UseQueryResult` is
/// irrelevant to it.
function preview(data: FeeBreakdown | undefined, stale: boolean): FeePreviewResult {
  return { data, stale } as FeePreviewResult;
}

describe("settledFee", () => {
  it("withholds the preview while the debounce is catching up", () => {
    // `data` then describes the *previous* keystroke's amount, and this feeds
    // the line the user reads immediately before submitting.
    expect(settledFee(preview(breakdown(3_000n, 1_003_000n), true))).toBeUndefined();
  });

  it("passes the preview through once it has settled", () => {
    const data = breakdown(3_000n, 1_003_000n);
    expect(settledFee(preview(data, false))).toBe(data);
  });
});

describe("joinHint", () => {
  it("drops the fragments that have nothing to say", () => {
    expect(joinHint("balance 1 USDC", undefined, "fee 0.003")).toBe("balance 1 USDC · fee 0.003");
  });

  it("is undefined rather than empty when every fragment is absent", () => {
    // `TextField` renders the hint slot only for a defined value; "" would
    // reserve the row and shift the field.
    expect(joinHint(undefined, undefined)).toBeUndefined();
  });
});
