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
