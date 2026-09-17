import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import type { FeeBreakdown } from "@/shared/domain/fee-math";
import { asBaseUnits } from "@/shared/domain/units";
import { crossAssetNote, feeLine } from "./fee-copy";
import { feeSummary } from "./fee-summary";

// Scale 100, so a figure that skips circuit-to-base scaling shows.
const USDC = { symbol: "USDC", decimals: 6, scale: 100n, index: RAY };
const USDT = { symbol: "USDT", decimals: 6, scale: 100n, index: RAY };

const AMOUNT = 1_000_000n;
const AMOUNT_BASE = AMOUNT * USDC.scale;

const protocol = (fee: bigint): FeeBreakdown => ({
  inAmt: asBaseUnits(AMOUNT_BASE),
  fee: asBaseUnits(fee),
  total: asBaseUnits(AMOUNT_BASE + fee),
  feeBps: 30n,
  leg: "deposit",
});

const relayerIn = (asset: typeof USDC, amount: bigint) => ({ amount, asset });
type Relayer = ReturnType<typeof relayerIn>;

type SummaryInputs = Parameters<typeof feeSummary>[0];

const summary = (over: Partial<SummaryInputs> & Pick<SummaryInputs, "kind">) =>
  feeSummary({
    amount: AMOUNT,
    spendAsset: USDC,
    protocol: undefined,
    relayer: undefined,
    ...over,
  });

describe("feeLine", () => {
  const transfer = (relayer?: Relayer, relayerAsset?: typeof USDC) =>
    summary({ kind: "transfer", relayer, relayerAsset });

  it("states the resolved answer and the asset it is paid in", () => {
    expect(feeLine(transfer(relayerIn(USDC, 2_500n)))).toBe("Total fees 0.25 USDC · paid in USDC");
    expect(feeLine(transfer(relayerIn(USDC, 2_500n)), { short: true })).toBe(
      "Fees 0.25 USDC · in USDC",
    );
  });

  it("totals a withdraw's two fees", () => {
    const m = summary({
      kind: "withdraw",
      protocol: protocol(1_250_000n),
      relayer: relayerIn(USDC, 3_100n),
    });
    expect(feeLine(m)).toBe("Total fees 1.56 USDC · paid in USDC");
  });

  it("names the relayer's asset on a cross-asset fee", () => {
    expect(feeLine(transfer(relayerIn(USDT, 5_100n)))).toBe("Total fees 0.51 USDT · paid in USDT");
  });

  it("refuses to add two tokens together", () => {
    const m = summary({
      kind: "withdraw",
      protocol: protocol(1_250_000n),
      relayer: relayerIn(USDT, 5_100n),
    });
    expect(feeLine(m)).toBe("Total fees 1.25 USDC + 0.51 USDT · relayer paid in USDT");
    expect(feeLine(m, { short: true })).toBe("Fees 1.25 USDC + 0.51 USDT · relayer in USDT");
  });

  it("says it is still working rather than printing a partial sum", () => {
    expect(feeLine(transfer(undefined, USDC))).toBe("Working out the fee…");
    expect(feeLine(transfer(undefined, USDC), { short: true })).toBe("Fees…");
  });

  it("says there are no fees when nothing is charged", () => {
    expect(feeLine(transfer())).toBe("No fees");
  });

  it("has nothing to say before an amount is typed", () => {
    expect(feeLine(undefined)).toBe("—");
  });
});

describe("crossAssetNote", () => {
  it("says a spend's relayer comes out of another shielded balance", () => {
    const m = summary({ kind: "transfer", relayer: relayerIn(USDT, 5_100n) });
    expect(crossAssetNote(m)).toBe(
      "The relayer is paid from your USDT balance, not the amount above.",
    );
  });

  it("says a deposit's is pulled from the wallet on top of the amount", () => {
    const m = summary({
      kind: "deposit",
      protocol: protocol(300_000n),
      relayer: relayerIn(USDT, 5_100n),
    });
    expect(crossAssetNote(m)).toBe(
      "The relayer is paid with USDT from your wallet, on top of the amount above.",
    );
    expect(feeLine(m)).toBe("Total fees 0.30 USDC + 0.51 USDT · relayer paid in USDT");
  });

  it("has nothing to add when the relayer is paid in the moved asset", () => {
    expect(crossAssetNote(summary({ kind: "deposit", relayer: relayerIn(USDC, 5_100n) }))).toBe(
      undefined,
    );
  });
});
