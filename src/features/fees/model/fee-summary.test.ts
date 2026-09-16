import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import type { FeeBreakdown } from "@/shared/domain/fee-math";
import { asBaseUnits } from "@/shared/domain/units";
import { allPriced, feeSummary, feeTotalUsd } from "./fee-summary";

// 6-decimal token at scale 100 — so circuit units and base units differ, and a
// row that forgot to scale one of them shows up.
const USDC = { symbol: "USDC", decimals: 6, scale: 100n, index: RAY };
const USDT = { symbol: "USDT", decimals: 6, scale: 100n, index: RAY };

/// 100 USDC in circuit units.
const AMOUNT = 1_000_000n;
const AMOUNT_BASE = AMOUNT * USDC.scale;

const protocol = (fee: bigint, feeBps = 30n): FeeBreakdown => ({
  inAmt: asBaseUnits(AMOUNT_BASE),
  fee: asBaseUnits(fee),
  total: asBaseUnits(AMOUNT_BASE + fee),
  feeBps,
  leg: "deposit",
});

/// A relayer charge, already joined to a registry entry — the shape
/// `resolveFeeOption` hands back.
const relayerIn = (asset: typeof USDC, amount: bigint) => ({ amount, asset });
type Relayer = ReturnType<typeof relayerIn>;

type SummaryInputs = Parameters<typeof feeSummary>[0];

/// `feeSummary` on 100 USDC, with nothing priced unless the case says so.
const summary = (over: Partial<SummaryInputs> & Pick<SummaryInputs, "kind">) =>
  feeSummary({
    amount: AMOUNT,
    spendAsset: USDC,
    protocol: undefined,
    relayer: undefined,
    ...over,
  });

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
    const m = summary({ kind: "transfer" });
    expect(row(m, "amount")?.amount).toBe(AMOUNT_BASE);
  });

  it("scales a relayer quote too — it arrives in circuit units", () => {
    const m = summary({ kind: "transfer", relayer: relayerIn(USDC, 2_042n) });
    expect(row(m, "relayer")?.amount).toBe(2_042n * USDC.scale);
  });

  describe("deposit", () => {
    // Permit2 pulls all three parts in one transfer, so both fees are on top
    // and both belong in the headline.
    const deposit = (relayer?: Relayer) =>
      summary({
        kind: "deposit",
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

    it("totals the two fees when both are in the deposited asset", () => {
      expect(deposit()?.total?.amount).toBe(300_000n + 2_042n * USDC.scale);
      expect(deposit()?.crossAsset).toBe(false);
      expect(deposit()?.headlineExtra).toBeUndefined();
    });

    // Paid in another token, the relayer's share is a pull of its own: stated
    // beside the headline, per token, and never summed into it.
    it("states a cross-asset relayer fee per token", () => {
      const m = deposit(relayerIn(USDT, 2_042n));
      expect(m?.crossAsset).toBe(true);
      expect(m?.total).toBeUndefined();
      expect(m?.headline?.amount).toBe(AMOUNT_BASE + 300_000n);
      expect(m?.headline?.asset.symbol).toBe("USDC");
      expect(m?.headlineExtra).toMatchObject({
        amount: 2_042n * USDT.scale,
        asset: { symbol: "USDT" },
        sign: "none",
      });
    });
  });

  describe("withdraw", () => {
    const withdraw = (relayer?: Relayer) =>
      summary({ kind: "withdraw", protocol: protocol(300_000n), relayer });

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
      summary({
        kind: "transfer",
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

  describe("a yield asset's index", () => {
    // A pool index 8% above par: a note credited at par is now worth 1.08x its
    // deposit, and that gain is withdrawable like any other value.
    const RAY = 10n ** 27n;
    const INDEX = (RAY * 108n) / 100n;
    const YUSDC = { ...USDC, index: INDEX };
    const YIELDED_BASE = (AMOUNT * USDC.scale * INDEX) / RAY;

    it("is counted in the amount being moved", () => {
      const m = summary({ kind: "withdraw", spendAsset: YUSDC });
      expect(row(m, "amount")?.amount).toBe(YIELDED_BASE);
      expect(YIELDED_BASE).toBeGreaterThan(AMOUNT_BASE);
    });

    it("is counted in what a withdraw pays out", () => {
      // The headline is `amount - protocolFee`, and `feeBreakdown` sizes that
      // fee against the *indexed* amount. Scaling the amount without the index
      // would subtract today's fee from the deposit-time value, understating
      // the payout by the whole of the yield.
      const fee = 324_000n;
      const m = summary({
        kind: "withdraw",
        spendAsset: YUSDC,
        protocol: {
          inAmt: asBaseUnits(YIELDED_BASE),
          fee: asBaseUnits(fee),
          total: asBaseUnits(YIELDED_BASE - fee),
          feeBps: 30n,
          leg: "withdraw",
        },
      });
      expect(m?.headline?.amount).toBe(YIELDED_BASE - fee);
    });

    it("is counted in a relayer quote, which also arrives in circuit units", () => {
      const m = summary({ kind: "withdraw", spendAsset: YUSDC, relayer: relayerIn(YUSDC, 2_000n) });
      expect(row(m, "relayer")?.amount).toBe((2_000n * USDC.scale * INDEX) / RAY);
    });
  });

  describe("cross-asset relayer fee", () => {
    const crossed = summary({
      kind: "withdraw",
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
    const m = summary({ kind: "withdraw", protocol: protocol(0n), relayer: relayerIn(USDC, 0n) });
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
      summary({ kind: "deposit", protocolPending: true, feeBps: 30n, relayerAsset: USDC });

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
      const settled = summary({
        kind: "deposit",
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
      const m = summary({ kind: "withdraw", protocol: protocol(300_000n), relayerAsset: USDT });
      expect(m?.headline?.amount).toBe(AMOUNT_BASE - 300_000n);
      expect(row(m, "relayer")?.amount).toBeUndefined();
    });

    it("opens no protocol row for a caller that will never fill one in", () => {
      // A swap is charged the fee and states it on its own quote card, so it
      // passes no breakdown. Inferring one from the rate would leave the panel
      // holding a line open forever.
      const m = summary({ kind: "swap", feeBps: 30n });
      expect(row(m, "protocol")).toBeUndefined();
    });

    it("opens no protocol row on a pool that charges nothing", () => {
      const m = summary({ kind: "withdraw", protocolPending: true, feeBps: 0n });
      expect(row(m, "protocol")).toBeUndefined();
      expect(m?.headline?.amount).toBe(AMOUNT_BASE);
    });

    it("flags a cross-asset fee before the quote pricing it arrives", () => {
      const m = summary({ kind: "transfer", relayerAsset: USDT });
      expect(m?.crossAsset).toBe(true);
    });

    it("does not claim a cross-asset fee when there is no relayer row at all", () => {
      // The panel's note names `rows.find(key === "relayer")`, so setting the
      // flag without such a row would print an undefined symbol.
      const m = summary({
        kind: "withdraw",
        protocol: protocol(300_000n),
        relayer: relayerIn(USDT, 0n),
      });
      expect(row(m, "relayer")).toBeUndefined();
      expect(m?.crossAsset).toBe(false);
    });
  });

  it("omits the headline on a swap, which the quote card already states", () => {
    const m = summary({
      kind: "swap",
      protocol: protocol(300_000n),
      relayer: relayerIn(USDC, 2_042n),
    });
    expect(m?.headline).toBeUndefined();
    expect(row(m, "protocol")?.sign).toBe("minus");
  });
});

describe("allPriced", () => {
  it("holds a review's confirm until every fee row has a figure", () => {
    const pending = summary({ kind: "withdraw", protocol: protocol(300_000n), relayerAsset: USDC });
    expect(allPriced(pending)).toBe(false);
    const settled = summary({
      kind: "withdraw",
      protocol: protocol(300_000n),
      relayer: relayerIn(USDC, 2_042n),
    });
    expect(allPriced(settled)).toBe(true);
  });

  it("has nothing to confirm without a model", () => {
    expect(allPriced(undefined)).toBe(false);
  });
});

describe("feeTotalUsd", () => {
  const PRICED = { ...USDC, token: "0xusdc" };
  const price = (token: string | undefined) => (token === "0xusdc" ? 2 : undefined);

  it("prices base-unit rows without scaling them a second time", () => {
    // 0.25 USDC at scale 100: the row is 250_000 base units. Handing that to
    // `usdValue` with scale 100 would read it as 25 USDC.
    const m = summary({ kind: "transfer", spendAsset: PRICED, relayer: relayerIn(PRICED, 2_500n) });
    expect(feeTotalUsd(m, price)).toBeCloseTo(0.5, 9);
  });

  it("is unknown when a row is unpriced, not smaller", () => {
    const m = summary({
      kind: "withdraw",
      spendAsset: PRICED,
      protocol: protocol(1_000_000n),
      relayer: relayerIn(USDT, 5_100n),
    });
    expect(feeTotalUsd(m, price)).toBeUndefined();
  });

  it("is unknown while a figure is still in flight", () => {
    const m = summary({ kind: "transfer", spendAsset: PRICED, relayerAsset: PRICED });
    expect(feeTotalUsd(m, price)).toBeUndefined();
  });

  it("is a known zero when nothing is charged", () => {
    const m = summary({ kind: "transfer", spendAsset: PRICED });
    expect(feeTotalUsd(m, price)).toBe(0);
  });
});
