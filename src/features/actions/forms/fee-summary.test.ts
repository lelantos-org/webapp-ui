import { describe, expect, it } from "vitest";
import type { FeeBreakdown } from "@/shared/lib/fees";
import { feeSummary } from "./fee-summary";

// 6-decimal token at scale 100 — so circuit units and base units differ, and a
// row that forgot to scale one of them shows up.
const USDC = { symbol: "USDC", decimals: 6, scale: 100n };
const USDT = { symbol: "USDT", decimals: 6, scale: 100n };

/// 100 USDC in circuit units.
const AMOUNT = 1_000_000n;
const AMOUNT_BASE = AMOUNT * USDC.scale;

const protocol = (fee: bigint, feeBps = 30n): FeeBreakdown => ({
  inAmt: AMOUNT_BASE,
  fee,
  total: AMOUNT_BASE + fee,
  feeBps,
  mode: "deposit",
});

/// A relayer charge, already joined to a registry entry — the shape
/// `resolveFeeOption` hands back.
const relayerIn = (asset: typeof USDC, amount: bigint) => ({ amount, asset });
type Relayer = ReturnType<typeof relayerIn>;

const row = (m: ReturnType<typeof feeSummary>, key: string) => m?.rows.find((r) => r.key === key);

describe("feeSummary", () => {
  it("is absent until there is an amount to charge against", () => {
    const args = {
      kind: "deposit" as const,
      spendAsset: USDC,
      protocol: undefined,
      relayer: undefined,
    };
    expect(feeSummary({ ...args, amount: undefined })).toBeUndefined();
    expect(feeSummary({ ...args, amount: 0n })).toBeUndefined();
    expect(feeSummary({ ...args, amount: AMOUNT, spendAsset: undefined })).toBeUndefined();
  });

  it("scales the amount from circuit units to base units", () => {
    const m = feeSummary({
      kind: "transfer",
      amount: AMOUNT,
      spendAsset: USDC,
      protocol: undefined,
      relayer: undefined,
    });
    expect(row(m, "amount")?.amount).toBe(AMOUNT_BASE);
  });

  it("scales a relayer quote too — it arrives in circuit units", () => {
    const m = feeSummary({
      kind: "transfer",
      amount: AMOUNT,
      spendAsset: USDC,
      protocol: undefined,
      relayer: relayerIn(USDC, 2_042n),
    });
    expect(row(m, "relayer")?.amount).toBe(2_042n * USDC.scale);
  });

  describe("deposit", () => {
    // Permit2 pulls all three parts in one transfer, so both fees are on top
    // and both belong in the headline.
    const deposit = (relayer?: Relayer) =>
      feeSummary({
        kind: "deposit",
        amount: AMOUNT,
        spendAsset: USDC,
        protocol: protocol(300_000n),
        relayer: relayer ?? relayerIn(USDC, 2_042n),
      });

    it("charges both fees on top", () => {
      const m = deposit();
      expect(row(m, "protocol")?.sign).toBe("plus");
      expect(row(m, "relayer")?.sign).toBe("plus");
    });

    it("puts both fees in what the payer is pulled", () => {
      const m = deposit();
      expect(m?.headline?.label).toBe("You pay");
      expect(m?.headline?.amount).toBe(AMOUNT_BASE + 300_000n + 2_042n * USDC.scale);
    });

    it("totals the two fees, which always share the deposited asset", () => {
      expect(deposit()?.total?.amount).toBe(300_000n + 2_042n * USDC.scale);
      expect(deposit()?.crossAsset).toBe(false);
    });
  });

  describe("withdraw", () => {
    const withdraw = (relayer?: Relayer) =>
      feeSummary({
        kind: "withdraw",
        amount: AMOUNT,
        spendAsset: USDC,
        protocol: protocol(300_000n),
        relayer,
      });

    it("deducts the protocol fee from what the recipient receives", () => {
      const m = withdraw();
      expect(row(m, "protocol")?.sign).toBe("minus");
      expect(m?.headline?.label).toBe("You receive");
      expect(m?.headline?.amount).toBe(AMOUNT_BASE - 300_000n);
    });

    it("leaves the relayer fee out of what the recipient receives", () => {
      // It is funded from the sender's shielded change, not skimmed off
      // `publicOut` — so it must not move this figure.
      const withFee = withdraw(relayerIn(USDC, 2_042n));
      expect(withFee?.headline?.amount).toBe(AMOUNT_BASE - 300_000n);
      expect(withFee?.headline?.amount).toBe(withdraw()?.headline?.amount);
      expect(row(withFee, "relayer")?.sign).toBe("plus");
    });
  });

  describe("transfer", () => {
    const transfer = (relayer?: Relayer) =>
      feeSummary({
        kind: "transfer",
        amount: AMOUNT,
        spendAsset: USDC,
        // A transfer has no transparent leg, so `MASP._takeFee` never runs.
        // Even handed a breakdown, it must not state a protocol fee.
        protocol: protocol(300_000n),
        relayer,
      });

    it("states no protocol fee", () => {
      expect(row(transfer(), "protocol")).toBeUndefined();
    });

    it("gives the recipient exactly what was typed", () => {
      const m = transfer(relayerIn(USDC, 2_042n));
      expect(m?.headline?.label).toBe("Recipient gets");
      expect(m?.headline?.amount).toBe(AMOUNT_BASE);
    });

    it("has no total when the relayer fee is the only fee", () => {
      // One row is not a sum, and labelling it "Total fees" would just repeat
      // the line above it.
      expect(transfer(relayerIn(USDC, 2_042n))?.total).toBeUndefined();
    });
  });

  describe("cross-asset relayer fee", () => {
    const crossed = feeSummary({
      kind: "withdraw",
      amount: AMOUNT,
      spendAsset: USDC,
      protocol: protocol(300_000n),
      relayer: relayerIn(USDT, 5_100n),
    });

    it("is flagged, so the panel can say which balance pays", () => {
      expect(crossed?.crossAsset).toBe(true);
      expect(row(crossed, "relayer")?.asset.symbol).toBe("USDT");
    });

    it("refuses to total two different tokens", () => {
      // Adding raw base units across assets yields a number that looks right
      // and means nothing.
      expect(crossed?.total).toBeUndefined();
    });
  });

  it("omits a zero fee rather than showing a zero row", () => {
    // A subsidised chain charges nothing, and "0.00" reads as a failed pricing
    // rather than as free.
    const m = feeSummary({
      kind: "withdraw",
      amount: AMOUNT,
      spendAsset: USDC,
      protocol: protocol(0n),
      relayer: relayerIn(USDC, 0n),
    });
    expect(row(m, "protocol")).toBeUndefined();
    expect(row(m, "relayer")).toBeUndefined();
    expect(m?.total).toBeUndefined();
    expect(m?.headline?.amount).toBe(AMOUNT_BASE);
  });

  describe("charges that have not been priced yet", () => {
    // The panel sits directly above the submit button, so a row appearing when
    // a query lands moves the button under the pointer. A charge known to be
    // coming gets its row now, with no figure in it.
    const pendingBoth = () =>
      feeSummary({
        kind: "deposit",
        amount: AMOUNT,
        spendAsset: USDC,
        protocol: undefined,
        protocolPending: true,
        feeBps: 30n,
        relayer: undefined,
        relayerAsset: USDC,
      });

    it("opens the protocol row on the rate alone, labelled from it", () => {
      const r = row(pendingBoth(), "protocol");
      expect(r?.amount).toBeUndefined();
      expect(r?.label).toBe("Protocol fee (0.30%)");
    });

    it("opens the relayer row on the paying asset alone", () => {
      const r = row(pendingBoth(), "relayer");
      expect(r?.amount).toBeUndefined();
      expect(r?.asset.symbol).toBe("USDC");
    });

    it("holds the same rows once the figures land", () => {
      const settled = feeSummary({
        kind: "deposit",
        amount: AMOUNT,
        spendAsset: USDC,
        protocol: protocol(300_000n),
        protocolPending: false,
        feeBps: 30n,
        relayer: relayerIn(USDC, 2_042n),
        relayerAsset: USDC,
      });
      expect(settled?.rows.map((r) => r.key)).toEqual(pendingBoth()?.rows.map((r) => r.key));
      expect(!!settled?.total).toBe(!!pendingBoth()?.total);
    });

    it("refuses to total or headline a sum it does not have", () => {
      // Both are figures the reader acts on, so a partial sum that corrects
      // itself a moment later is withheld in favour of a visible gap.
      expect(pendingBoth()?.total?.amount).toBeUndefined();
      expect(pendingBoth()?.headline?.amount).toBeUndefined();
    });

    it("keeps a withdraw's headline once the protocol fee lands, relayer or not", () => {
      // Only the protocol fee moves what the recipient receives, so the
      // relayer quote being in flight must not blank it.
      const m = feeSummary({
        kind: "withdraw",
        amount: AMOUNT,
        spendAsset: USDC,
        protocol: protocol(300_000n),
        relayer: undefined,
        relayerAsset: USDT,
      });
      expect(m?.headline?.amount).toBe(AMOUNT_BASE - 300_000n);
      expect(row(m, "relayer")?.amount).toBeUndefined();
    });

    it("opens no protocol row for a caller that will never fill one in", () => {
      // A swap is charged the fee and states it on its own quote card, so it
      // passes no breakdown. Inferring one from the rate would leave the panel
      // holding a line open forever.
      const m = feeSummary({
        kind: "swap",
        amount: AMOUNT,
        spendAsset: USDC,
        protocol: undefined,
        feeBps: 30n,
        relayer: undefined,
      });
      expect(row(m, "protocol")).toBeUndefined();
    });

    it("opens no protocol row on a pool that charges nothing", () => {
      const m = feeSummary({
        kind: "withdraw",
        amount: AMOUNT,
        spendAsset: USDC,
        protocol: undefined,
        protocolPending: true,
        feeBps: 0n,
        relayer: undefined,
      });
      expect(row(m, "protocol")).toBeUndefined();
      expect(m?.headline?.amount).toBe(AMOUNT_BASE);
    });

    it("flags a cross-asset fee before the quote pricing it arrives", () => {
      const m = feeSummary({
        kind: "transfer",
        amount: AMOUNT,
        spendAsset: USDC,
        protocol: undefined,
        relayer: undefined,
        relayerAsset: USDT,
      });
      expect(m?.crossAsset).toBe(true);
    });

    it("does not claim a cross-asset fee when there is no relayer row at all", () => {
      // The panel's note names `rows.find(key === "relayer")`, so setting the
      // flag without such a row would print an undefined symbol.
      const m = feeSummary({
        kind: "withdraw",
        amount: AMOUNT,
        spendAsset: USDC,
        protocol: protocol(300_000n),
        relayer: relayerIn(USDT, 0n),
      });
      expect(row(m, "relayer")).toBeUndefined();
      expect(m?.crossAsset).toBe(false);
    });
  });

  it("omits the headline on a swap, which the quote card already states", () => {
    const m = feeSummary({
      kind: "swap",
      amount: AMOUNT,
      spendAsset: USDC,
      protocol: protocol(300_000n),
      relayer: relayerIn(USDC, 2_042n),
    });
    expect(m?.headline).toBeUndefined();
    expect(row(m, "protocol")?.sign).toBe("minus");
  });
});
