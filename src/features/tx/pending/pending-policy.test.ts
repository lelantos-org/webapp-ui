import { describe, expect, it } from "vitest";
import { type PendingContext, pendingShapesFor } from "./pending-policy";

// Only the fields the policy reads are populated; the rest of the SDK
// receipt is irrelevant to this mapping.
const money = (amount: bigint) => ({ amount });
const asset = (id: bigint) => ({ id });

const deposit = (id: bigint, amount: bigint, own = true) =>
  ({
    kind: "deposit",
    result: { asset: asset(id), amount: money(amount), ownCommitments: own ? ["0xcm"] : [] },
  }) as unknown as PendingContext;

describe("pendingShapesFor", () => {
  it("credits a deposit's own note with no outflow", () => {
    expect(pendingShapesFor(deposit(1n, 500n))).toEqual([
      { asset: 1n, pendingIn: 500n, outflow: 0n },
    ]);
  });

  it("emits nothing for a deposit this wallet will not recover", () => {
    expect(pendingShapesFor(deposit(1n, 500n, false))).toEqual([]);
  });

  it("counts a transfer's amount as outflow and its change as inflow", () => {
    const ctx = {
      kind: "transfer",
      isSelfTransfer: false,
      result: { asset: asset(1n), change: 20n, amount: money(80n) },
    } as unknown as PendingContext;
    expect(pendingShapesFor(ctx)).toEqual([{ asset: 1n, pendingIn: 20n, outflow: 80n }]);
  });

  it("reports no outflow for a self-transfer — the value never leaves", () => {
    const ctx = {
      kind: "transfer",
      isSelfTransfer: true,
      result: { asset: asset(1n), change: 0n, amount: money(100n) },
    } as unknown as PendingContext;
    expect(pendingShapesFor(ctx)).toEqual([{ asset: 1n, pendingIn: 100n, outflow: 0n }]);
  });

  it("counts a withdraw's gross as outflow", () => {
    const ctx = {
      kind: "withdraw",
      result: { asset: asset(2n), change: 5n, gross: money(95n) },
    } as unknown as PendingContext;
    expect(pendingShapesFor(ctx)).toEqual([{ asset: 2n, pendingIn: 5n, outflow: 95n }]);
  });

  describe("swap", () => {
    const legA = { asset: asset(1n), change: 10n, gross: money(90n) };

    it("emits only leg-A when no wallet was available for leg-B data", () => {
      const ctx = { kind: "swap", result: legA } as unknown as PendingContext;
      expect(pendingShapesFor(ctx)).toEqual([{ asset: 1n, pendingIn: 10n, outflow: 90n }]);
    });

    it("adds the leg-B note as an inflow the wallet's balance has to reach", () => {
      // Sizing itself belongs to the quote's `credit`; what this asserts is the
      // watermark built on top of it — the balance the note will actually
      // produce, not `baseline + 1`, which any unrelated inflow on `assetOut`
      // satisfied while the swap was still settling.
      const ctx = {
        kind: "swap",
        result: legA,
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
        result: { asset: asset(1n), change: 0n, gross: money(0n) },
        legB: { assetOut: 2n, bNoteValue: 0n, assetOutBaseline: 0n },
      } as unknown as PendingContext;
      expect(pendingShapesFor(ctx)).toEqual([]);
    });
  });
});
