import { describe, expect, it } from "vitest";
import type { FeeBreakdown } from "@/shared/domain/fee-math";
import { asBaseUnits } from "@/shared/domain/units";
import { type FeePreviewResult, settledFee } from "./use-fee-preview";

function breakdown(fee: bigint, total: bigint, feeBps = 30n): FeeBreakdown {
  return {
    inAmt: asBaseUnits(1_000_000n),
    fee: asBaseUnits(fee),
    total: asBaseUnits(total),
    feeBps,
    leg: "deposit",
  };
}

function preview(data: FeeBreakdown | undefined, stale: boolean): FeePreviewResult {
  return { data, stale } as FeePreviewResult;
}

describe("settledFee", () => {
  it("withholds the preview while the debounce is catching up", () => {
    expect(settledFee(preview(breakdown(3_000n, 1_003_000n), true))).toBeUndefined();
  });

  it("passes the preview through once it has settled", () => {
    const data = breakdown(3_000n, 1_003_000n);
    expect(settledFee(preview(data, false))).toBe(data);
  });
});
