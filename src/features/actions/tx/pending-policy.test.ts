import { describe, expect, it } from "vitest";
import type { SwapCall, WithAsset } from "../port";
import { type PendingContext, pendingShapesFor } from "./pending-policy";

// Only the fields the policy reads are populated; the rest of the SDK
// receipt is irrelevant to this mapping.
function result<R>(fields: R): WithAsset<R & { asset: bigint }> {
  return fields as never;
}

const deposit = (asset: bigint, ownInflow: bigint) =>
  ({ kind: "deposit", result: result({ asset, ownInflow }) }) as unknown as PendingContext;

describe("pendingShapesFor", () => {
  it("credits a deposit's own inflow with no outflow", () => {
    expect(pendingShapesFor(deposit(1n, 500n))).toEqual([
      { asset: 1n, pendingIn: 500n, outflow: 0n },
    ]);
  });

  it("emits nothing when a tx produces neither inflow nor outflow", () => {
    expect(pendingShapesFor(deposit(1n, 0n))).toEqual([]);
  });

  it("counts a transfer's sent amount as outflow", () => {
    const ctx = {
      kind: "transfer",
      isSelfTransfer: false,
      result: result({ asset: 1n, ownInflow: 20n, sent: 80n }),
    } as unknown as PendingContext;
    expect(pendingShapesFor(ctx)).toEqual([{ asset: 1n, pendingIn: 20n, outflow: 80n }]);
  });

  it("reports no outflow for a self-transfer — the value never leaves", () => {
    const ctx = {
      kind: "transfer",
      isSelfTransfer: true,
      result: result({ asset: 1n, ownInflow: 100n, sent: 100n }),
    } as unknown as PendingContext;
    expect(pendingShapesFor(ctx)).toEqual([{ asset: 1n, pendingIn: 100n, outflow: 0n }]);
  });

  it("counts a withdraw's sent amount as outflow", () => {
    const ctx = {
      kind: "withdraw",
      result: result({ asset: 2n, ownInflow: 5n, sent: 95n }),
    } as unknown as PendingContext;
    expect(pendingShapesFor(ctx)).toEqual([{ asset: 2n, pendingIn: 5n, outflow: 95n }]);
  });

  describe("swap", () => {
    const swapCall = (assetOut: bigint, minOut: bigint): SwapCall =>
      ({ assetIn: 1n, assetOut, amount: 100n, quote: { minOut } }) as SwapCall;

    it("emits only leg-A when no wallet was available for leg-B data", () => {
      const ctx = {
        kind: "swap",
        result: result({ asset: 1n, ownInflow: 10n, sent: 90n }),
      } as unknown as PendingContext;
      expect(pendingShapesFor(ctx)).toEqual([{ asset: 1n, pendingIn: 10n, outflow: 90n }]);
    });

    it("sizes the leg-B inflow the way the SDK sizes the B-note", () => {
      const ctx = {
        kind: "swap",
        result: result({ asset: 1n, ownInflow: 10n, sent: 90n }),
        legB: {
          swap: swapCall(2n, 10_050n),
          assetOutBaseline: 7n,
          scaleOut: 1n,
          feeBps: 50n,
        },
      } as unknown as PendingContext;
      // 10_000 * 1 + 50bps = 10_050, exactly covering minOut.
      expect(pendingShapesFor(ctx)).toEqual([
        { asset: 1n, pendingIn: 10n, outflow: 90n },
        {
          asset: 2n,
          pendingIn: 10_000n,
          outflow: 0n,
          // The balance this note will actually produce. `baseline + 1` was
          // satisfied by any unrelated inflow on `assetOut` — an inbound
          // transfer, a concurrent deposit — and dropped the overlay while the
          // swap was still settling.
          clearWhenBalanceAtLeast: 10_007n,
        },
      ]);
    });

    it("divides the leg-B inflow down by the output asset's scale", () => {
      const ctx = {
        kind: "swap",
        result: result({ asset: 1n, ownInflow: 0n, sent: 0n }),
        legB: {
          swap: swapCall(2n, 10_000n * 1_000n),
          assetOutBaseline: 0n,
          scaleOut: 1_000n,
          feeBps: 0n,
        },
      } as unknown as PendingContext;
      // 10_000 * 1_000 == 10_000_000, and a zero fee adds nothing.
      expect(pendingShapesFor(ctx)).toEqual([
        { asset: 2n, pendingIn: 10_000n, outflow: 0n, clearWhenBalanceAtLeast: 10_000n },
      ]);
    });

    it("rounds a sub-unit minOut up to the one unit that actually gets minted", () => {
      // The closed form floors this to zero, and the old code dropped the entry
      // — but the SDK walks up until the pull covers `minOut`, so a note of one
      // circuit unit is what is really minted. Dropping it hid an inflow the
      // wallet was about to receive.
      const ctx = {
        kind: "swap",
        result: result({ asset: 1n, ownInflow: 0n, sent: 0n }),
        legB: {
          swap: swapCall(2n, 1n),
          assetOutBaseline: 0n,
          scaleOut: 10n ** 18n,
          feeBps: 0n,
        },
      } as unknown as PendingContext;
      expect(pendingShapesFor(ctx)).toEqual([
        { asset: 2n, pendingIn: 1n, outflow: 0n, clearWhenBalanceAtLeast: 1n },
      ]);
    });

    it("drops the leg-B entry when the output scale is degenerate", () => {
      const ctx = {
        kind: "swap",
        result: result({ asset: 1n, ownInflow: 0n, sent: 0n }),
        legB: {
          swap: swapCall(2n, 1_000n),
          assetOutBaseline: 0n,
          scaleOut: 0n,
          feeBps: 0n,
        },
      } as unknown as PendingContext;
      expect(pendingShapesFor(ctx)).toEqual([]);
    });
  });
});
