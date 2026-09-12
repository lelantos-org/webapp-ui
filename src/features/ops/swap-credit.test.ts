import { describe, expect, it } from "vitest";
import { swapCredit } from "./swap-credit";

const credit = (minOut: bigint, scaleOut: bigint, feeBps: bigint, depositFee = 0n) =>
  swapCredit({ minOut, scaleOut, feeBps, depositFee });

describe("swapCredit", () => {
  it("sizes the note the way the SDK sizes it", () => {
    // 10_000 * 1 + 50bps == 10_050, exactly covering minOut.
    expect(credit(10_050n, 1n, 50n)).toBe(10_000n);
  });

  it("divides down by the output asset's scale", () => {
    expect(credit(10_000n * 1_000n, 1_000n, 0n)).toBe(10_000n);
  });

  it("shrinks the note by the relayer's flush fee", () => {
    // The flush note rides in the same pull as the B-note, so a charged
    // relayer means a smaller credit. Sizing without it put the pending
    // overlay's watermark above the balance the swap could ever produce, and
    // the leg-2 entry then sat settling until its TTL expired.
    //
    // 9_980 + 50bps (49) + 20 == 10_049 — one short, so the walk lands on
    // 9_981: 9_981 + 49 + 20 == 10_050.
    expect(credit(10_050n, 1n, 50n, 20n)).toBe(9_981n);
  });

  it("rounds a sub-unit minOut up to the one unit that actually gets minted", () => {
    // The closed form floors this to zero, but the SDK walks up until the pull
    // covers `minOut`, so a note of one circuit unit is what is really minted.
    expect(credit(1n, 10n ** 18n, 0n)).toBe(1n);
  });

  it("credits nothing when the output scale is degenerate", () => {
    expect(credit(1_000n, 0n, 0n)).toBe(0n);
  });
});
