import type { FeeQuote } from "@lelantos-org/sdk";
import type { NameFee } from "@lelantos-org/sdk/advanced";
import { describe, expect, it } from "vitest";
import { makeAsset, USDC_ASSET } from "@/test/fixtures/assets";
import { feeReading, registrarFeeLabel, relayerFeeLabel } from "./fees";

const fee = (amount: bigint) => ({ amount }) as Pick<NameFee, "amount">;

describe("registrarFeeLabel", () => {
  it("prints the fee in the asset that pays it", () => {
    expect(registrarFeeLabel(fee(5_000_000n), USDC_ASSET)).toBe("5.00 USDC");
  });

  it("has no text for a fee until the asset that pays it is known", () => {
    expect(registrarFeeLabel(fee(5_000_000n), undefined)).toBeUndefined();
  });

  it("says a registration is free, whatever pays for it", () => {
    expect(registrarFeeLabel(fee(0n), USDC_ASSET)).toBe("Free");
    expect(registrarFeeLabel(fee(0n), undefined)).toBe("Free");
  });
});

describe("relayerFeeLabel", () => {
  const quote = (charged: boolean, ...options: [asset: bigint, baseUnits: bigint][]) =>
    ({
      charged,
      options: options.map(([id, baseUnits]) => ({ asset: { id }, baseUnits })),
    }) as unknown as FeeQuote;

  it("prints the option quoted in the paying asset", () => {
    const DAI = makeAsset(2n, "DAI");
    const quoted = quote(true, [DAI.id, 10n ** 18n], [USDC_ASSET.id, 250_000n]);
    expect(relayerFeeLabel(quoted, USDC_ASSET)).toBe("0.25 USDC");
  });

  it("says so when the relayer charges nothing", () => {
    expect(relayerFeeLabel(quote(false), USDC_ASSET)).toBe("None");
  });

  it("says so when the relayer charges, and not in the paying asset", () => {
    expect(relayerFeeLabel(quote(true), USDC_ASSET)).toBe("Not payable in USDC");
  });

  it("has no text before the quote or the paying asset is known", () => {
    expect(relayerFeeLabel(undefined, USDC_ASSET)).toBeUndefined();
    expect(relayerFeeLabel(quote(true, [USDC_ASSET.id, 250_000n]), undefined)).toBeUndefined();
  });
});

describe("feeReading", () => {
  it("is loading until there is a text, or failed when the read was", () => {
    expect(feeReading(undefined, false)).toEqual({ state: "loading" });
    expect(feeReading(undefined, true)).toEqual({ state: "failed" });
  });

  it("keeps showing a text in hand when a later read failed", () => {
    expect(feeReading("5.00 USDC", false)).toEqual({ state: "ready", text: "5.00 USDC" });
    expect(feeReading("5.00 USDC", true)).toEqual({ state: "ready", text: "5.00 USDC" });
  });
});
