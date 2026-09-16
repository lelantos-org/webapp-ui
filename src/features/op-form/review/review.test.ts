// @vitest-environment jsdom
import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import { feeSummary } from "@/features/fees";
import type { FeeBreakdown } from "@/shared/domain/fee-math";
import { asBaseUnits } from "@/shared/domain/units";
import { headlineLabel, leavesBalance, leavesBalanceLabel, reviewFigure } from "./review";

// 6 decimals at scale 100, so a figure that skipped the circuit-to-base
// conversion is off by a factor anyone would notice.
const USDC = { symbol: "USDC", decimals: 6, scale: 100n, index: RAY };
const ETH = { symbol: "ETH", decimals: 18, scale: 10_000_000_000n, index: RAY };

/// 250 USDC in circuit units.
const AMOUNT = 2_500_000n;
/// 0.25 USDC, in circuit units.
const RELAYER = 2_500n;

const protocol = (fee: bigint): FeeBreakdown => ({
  inAmt: asBaseUnits(AMOUNT * USDC.scale),
  fee: asBaseUnits(fee),
  total: asBaseUnits(AMOUNT * USDC.scale - fee),
  feeBps: 25n,
  leg: "withdraw",
});

describe("leavesBalance", () => {
  it("is the amount plus a same-asset relayer fee, as send.review.dc states", () => {
    const m = feeSummary({
      kind: "transfer",
      amount: AMOUNT,
      spendAsset: USDC,
      protocol: undefined,
      relayer: { amount: RELAYER, asset: USDC },
    });
    expect(leavesBalanceLabel(m)).toBe("250.25 USDC");
  });

  it("does not add the protocol fee, which comes out of the amount", () => {
    // Decision 18: a withdraw's protocol fee is skimmed off the transparent leg.
    const m = feeSummary({
      kind: "withdraw",
      amount: AMOUNT,
      spendAsset: USDC,
      protocol: protocol(625_000n),
      relayer: { amount: RELAYER, asset: USDC },
    });
    expect(leavesBalanceLabel(m)).toBe("250.25 USDC");
    // And what the recipient gets is base less the protocol fee only.
    expect(headlineLabel(m)).toBe("249.375 USDC");
  });

  it("keeps a cross-asset relayer fee apart rather than adding tokens", () => {
    const m = feeSummary({
      kind: "transfer",
      amount: AMOUNT,
      spendAsset: USDC,
      protocol: undefined,
      relayer: { amount: 10_000n, asset: ETH },
    });
    expect(leavesBalance(m)).toHaveLength(2);
    expect(leavesBalanceLabel(m)).toBe("250.00 USDC + 0.0001 ETH");
  });

  it("is unknown while the relayer's figure is in flight", () => {
    const m = feeSummary({
      kind: "transfer",
      amount: AMOUNT,
      spendAsset: USDC,
      protocol: undefined,
      relayer: undefined,
      relayerAsset: USDC,
    });
    expect(leavesBalance(m)).toBeUndefined();
    expect(leavesBalanceLabel(m)).toBe("—");
    expect(leavesBalanceLabel(undefined)).toBe("—");
  });

  it("is the amount alone on a subsidised chain", () => {
    const m = feeSummary({
      kind: "transfer",
      amount: AMOUNT,
      spendAsset: USDC,
      protocol: undefined,
      relayer: undefined,
    });
    expect(leavesBalanceLabel(m)).toBe("250.00 USDC");
  });
});

describe("reviewFigure", () => {
  it("states the figure to two places and the same figure in words", () => {
    expect(reviewFigure(AMOUNT, USDC)).toEqual({
      figure: "250.00",
      words: "Two hundred fifty and 00/100 USDC",
    });
  });

  it("keeps every significant digit past two", () => {
    const { figure, words } = reviewFigure(1_234_567n, USDC, "USDC");
    expect(figure).toBe("123.4567");
    expect(words).toBe("One hundred twenty-three and 4567/10000 USDC");
  });

  it("writes the words from the figure, so thousands separators do not leak in", () => {
    expect(reviewFigure(318_000_000n, USDC).words).toBe(
      "Thirty-one thousand eight hundred and 00/100 USDC",
    );
  });
});
