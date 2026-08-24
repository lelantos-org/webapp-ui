import { describe, expect, it } from "vitest";
import { feeLine, joinHint, settledFee } from "@/features/actions/forms/fee-hint";
import type { FeePreviewResult } from "@/features/actions/use-fee-preview";
import type { FeeBreakdown } from "@/shared/lib/fees";

const USDC = { symbol: "USDC", decimals: 6 };

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

describe("feeLine", () => {
  it("states what leaves the wallet for a deposit", () => {
    expect(feeLine(breakdown(3_000n, 1_003_000n), USDC, "total")).toBe(
      "fee 0.003 (0.30%) · total 1.003 USDC",
    );
  });

  it("states what arrives for a withdraw", () => {
    expect(feeLine(breakdown(3_000n, 997_000n), USDC, "receive")).toBe(
      "fee 0.003 (0.30%) · receive 0.997 USDC",
    );
  });

  it("says nothing when the chain charges no fee", () => {
    expect(feeLine(breakdown(0n, 1_000_000n, 0n), USDC, "total")).toBeUndefined();
  });

  it("says nothing without a preview or an asset", () => {
    expect(feeLine(undefined, USDC, "total")).toBeUndefined();
    expect(feeLine(breakdown(3_000n, 1_003_000n), undefined, "total")).toBeUndefined();
  });

  it("formats by the token's decimals, not the circuit scale", () => {
    // The breakdown is in ERC20 base units; applying a scale here would state
    // an amount the wallet never sees. `formatDecimalCompact` then caps the
    // fraction, which is why the trailing dust of `total` is not shown while
    // the sub-cap `fee` keeps every digit it needs to be non-zero.
    expect(feeLine(breakdown(5n, 1_000_005n), { symbol: "WETH", decimals: 18 }, "total")).toBe(
      "fee 0.000000000000000005 (0.30%) · total 0.000000000001 WETH",
    );
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
