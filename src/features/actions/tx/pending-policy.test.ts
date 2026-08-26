import { describe, expect, it } from "vitest";
import type { WithAsset } from "../port";
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
    it("emits only leg-A when no wallet was available for leg-B data", () => {
      const ctx = {
        kind: "swap",
        result: result({ asset: 1n, ownInflow: 10n, sent: 90n }),
      } as unknown as PendingContext;
      expect(pendingShapesFor(ctx)).toEqual([{ asset: 1n, pendingIn: 10n, outflow: 90n }]);
    });

    it("adds the leg-B note as an inflow the wallet's balance has to reach", () => {
      // Sizing itself belongs to `swapCredit`; what this asserts is the
      // watermark built on top of it — the balance the note will actually
      // produce, not `baseline + 1`, which any unrelated inflow on `assetOut`
      // satisfied while the swap was still settling.
      const ctx = {
        kind: "swap",
        result: result({ asset: 1n, ownInflow: 10n, sent: 90n }),
        legB: { assetOut: 2n, bNoteValue: 10_000n, assetOutBaseline: 7n },
      } as unknown as PendingContext;
      expect(pendingShapesFor(ctx)).toEqual([
        { asset: 1n, pendingIn: 10n, outflow: 90n },
        { asset: 2n, pendingIn: 10_000n, outflow: 0n, clearWhenBalanceAtLeast: 10_007n },
      ]);
    });

    it("drops the leg-B entry when the swap credits nothing", () => {
      const ctx = {
        kind: "swap",
        result: result({ asset: 1n, ownInflow: 0n, sent: 0n }),
        legB: { assetOut: 2n, bNoteValue: 0n, assetOutBaseline: 0n },
      } as unknown as PendingContext;
      expect(pendingShapesFor(ctx)).toEqual([]);
    });
  });
});
