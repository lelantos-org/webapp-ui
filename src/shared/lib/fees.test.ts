import { RAY } from "@lelantos-org/sdk/core";
import { describe, expect, it } from "vitest";
import { feeBreakdown } from "./fees";

const SCALE = 10n ** 12n;

describe("feeBreakdown", () => {
  it("scales the amount into token base units", () => {
    const f = feeBreakdown({ amount: 5n, scale: SCALE, feeBps: 0n, mode: "deposit" });
    expect(f.inAmt).toBe(5n * SCALE);
    expect(f.fee).toBe(0n);
    expect(f.total).toBe(5n * SCALE);
  });

  it("adds the fee on top for deposits — the payer is debited", () => {
    // 50 bps of 1e12 == 5e9.
    const f = feeBreakdown({ amount: 1n, scale: SCALE, feeBps: 50n, mode: "deposit" });
    expect(f.fee).toBe(5_000_000_000n);
    expect(f.total).toBe(f.inAmt + f.fee);
  });

  it("deducts the fee for withdraws — the recipient is credited net", () => {
    const f = feeBreakdown({ amount: 1n, scale: SCALE, feeBps: 50n, mode: "withdraw" });
    expect(f.fee).toBe(5_000_000_000n);
    expect(f.total).toBe(f.inAmt - f.fee);
  });

  it("truncates the fee, matching Solidity integer division", () => {
    // 1 * 1 / 10_000 == 0.0001 -> 0
    expect(feeBreakdown({ amount: 1n, scale: 1n, feeBps: 1n, mode: "deposit" }).fee).toBe(0n);
    // 9999 * 1 / 10_000 -> 0
    expect(feeBreakdown({ amount: 9999n, scale: 1n, feeBps: 1n, mode: "deposit" }).fee).toBe(0n);
    // 10_000 * 1 / 10_000 -> 1
    expect(feeBreakdown({ amount: 10_000n, scale: 1n, feeBps: 1n, mode: "deposit" }).fee).toBe(1n);
  });

  it("passes feeBps and mode through for display", () => {
    const f = feeBreakdown({ amount: 2n, scale: 1n, feeBps: 30n, mode: "withdraw" });
    expect(f.feeBps).toBe(30n);
    expect(f.mode).toBe("withdraw");
  });

  it("returns zeroes for a zero amount", () => {
    const f = feeBreakdown({ amount: 0n, scale: SCALE, feeBps: 50n, mode: "deposit" });
    expect(f).toMatchObject({ inAmt: 0n, fee: 0n, total: 0n });
  });
});

// A yield asset's unit is worth `scale * index / RAY`, not `scale`. This figure
// sizes the Permit2 window in `mutations.ts`, so understating it is not a
// display bug — the pool pulls more than the window allows and the deposit
// reverts.
describe("feeBreakdown on a yield asset", () => {
  // 1.1 × RAY: the venue has earned 10%.
  const INDEX = (RAY * 11n) / 10n;

  it("costs more than the same amount at scale alone", () => {
    const flat = feeBreakdown({ amount: 1n, scale: SCALE, feeBps: 0n, mode: "deposit" });
    const earned = feeBreakdown({
      amount: 1n,
      scale: SCALE,
      feeBps: 0n,
      mode: "deposit",
      index: INDEX,
    });
    expect(earned.total).toBeGreaterThan(flat.total);
    expect(earned.inAmt).toBe((SCALE * 11n) / 10n);
  });

  it("defaults to RAY so a plain asset is untouched", () => {
    const a = feeBreakdown({ amount: 3n, scale: SCALE, feeBps: 20n, mode: "deposit" });
    const b = feeBreakdown({ amount: 3n, scale: SCALE, feeBps: 20n, mode: "deposit", index: RAY });
    expect(b).toEqual(a);
  });

  // Deposits round up and withdrawals down, so neither direction flatters the
  // user into a transaction that cannot settle.
  it("rounds a deposit up and a withdrawal down", () => {
    // An index that does not divide evenly, so the direction is observable.
    const odd = RAY + 1n;
    const dep = feeBreakdown({ amount: 1n, scale: 1n, feeBps: 0n, mode: "deposit", index: odd });
    const wd = feeBreakdown({ amount: 1n, scale: 1n, feeBps: 0n, mode: "withdraw", index: odd });
    expect(dep.inAmt).toBe(2n);
    expect(wd.inAmt).toBe(1n);
  });
});
