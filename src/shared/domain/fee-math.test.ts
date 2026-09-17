import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import { feeBreakdown } from "./fee-math";

const SCALE = 10n ** 12n;

describe("feeBreakdown", () => {
  it("scales the amount into token base units", () => {
    const f = feeBreakdown({ amount: 5n, scale: SCALE, feeBps: 0n, leg: "deposit" });
    expect(f.inAmt).toBe(5n * SCALE);
    expect(f.fee).toBe(0n);
    expect(f.total).toBe(5n * SCALE);
  });

  it("adds the fee on top for deposits — the payer is debited", () => {
    const f = feeBreakdown({ amount: 1n, scale: SCALE, feeBps: 50n, leg: "deposit" });
    expect(f.fee).toBe(5_000_000_000n);
    expect(f.total).toBe(f.inAmt + f.fee);
  });

  it("deducts the fee for withdraws — the recipient is credited net", () => {
    const f = feeBreakdown({ amount: 1n, scale: SCALE, feeBps: 50n, leg: "withdraw" });
    expect(f.fee).toBe(5_000_000_000n);
    expect(f.total).toBe(f.inAmt - f.fee);
  });

  it("truncates the fee, matching Solidity integer division", () => {
    expect(feeBreakdown({ amount: 1n, scale: 1n, feeBps: 1n, leg: "deposit" }).fee).toBe(0n);
    expect(feeBreakdown({ amount: 9999n, scale: 1n, feeBps: 1n, leg: "deposit" }).fee).toBe(0n);
    expect(feeBreakdown({ amount: 10_000n, scale: 1n, feeBps: 1n, leg: "deposit" }).fee).toBe(1n);
  });

  it("passes feeBps and leg through for display", () => {
    const f = feeBreakdown({ amount: 2n, scale: 1n, feeBps: 30n, leg: "withdraw" });
    expect(f.feeBps).toBe(30n);
    expect(f.leg).toBe("withdraw");
  });

  it("returns zeroes for a zero amount", () => {
    const f = feeBreakdown({ amount: 0n, scale: SCALE, feeBps: 50n, leg: "deposit" });
    expect(f).toMatchObject({ inAmt: 0n, fee: 0n, total: 0n });
  });
});

// Sizes the Permit2 window: understating it makes the deposit revert.
describe("feeBreakdown on a yield asset", () => {
  const INDEX = (RAY * 11n) / 10n;

  it("costs more than the same amount at scale alone", () => {
    const flat = feeBreakdown({ amount: 1n, scale: SCALE, feeBps: 0n, leg: "deposit" });
    const earned = feeBreakdown({
      amount: 1n,
      scale: SCALE,
      feeBps: 0n,
      leg: "deposit",
      index: INDEX,
    });
    expect(earned.total).toBeGreaterThan(flat.total);
    expect(earned.inAmt).toBe((SCALE * 11n) / 10n);
  });

  it("defaults to RAY so a plain asset is untouched", () => {
    const a = feeBreakdown({ amount: 3n, scale: SCALE, feeBps: 20n, leg: "deposit" });
    const b = feeBreakdown({ amount: 3n, scale: SCALE, feeBps: 20n, leg: "deposit", index: RAY });
    expect(b).toEqual(a);
  });

  it("rounds a deposit up and a withdrawal down", () => {
    const odd = RAY + 1n;
    const dep = feeBreakdown({ amount: 1n, scale: 1n, feeBps: 0n, leg: "deposit", index: odd });
    const wd = feeBreakdown({ amount: 1n, scale: 1n, feeBps: 0n, leg: "withdraw", index: odd });
    expect(dep.inAmt).toBe(2n);
    expect(wd.inAmt).toBe(1n);
  });
});
