// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeAsset, USDC_ASSET } from "@/test/fixtures/assets";
import { feeBlockReason } from "./fee-block";
import { feeLine } from "./fee-copy";
import { useFeePanel } from "./use-fee-panel";

const WETH = makeAsset(7n, "WETH");
const USDC = USDC_ASSET;

/// Only the two reads are stubbed; the registry join, the model and the block
/// are the real ones, since relabelling has to reach all three.
const stubs = vi.hoisted(() => ({ feeQuote: {} as Record<string, unknown> }));

vi.mock("./use-fee-quote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-fee-quote")>()),
  useFeeQuote: () => stubs.feeQuote,
}));

vi.mock("./use-fee-preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-fee-preview")>()),
  useAssetFeeBps: () => undefined,
}));

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  useRegisteredAssets: () => [WETH, USDC],
}));

function panel({
  spendSymbol,
  affordable = true,
  kind = "withdraw",
}: {
  spendSymbol?: string;
  affordable?: boolean;
  kind?: "withdraw" | "deposit";
}) {
  stubs.feeQuote = {
    data: {
      charged: true,
      options: [
        { asset: WETH, amount: 10n, balance: affordable ? 1_000n : 1n, affordable },
        { asset: USDC, amount: 10n, balance: 1_000n, affordable: true },
      ],
    },
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
  };
  return renderHook(() =>
    useFeePanel({
      kind,
      selected: WETH,
      amount: 1_000n,
      protocol: undefined,
      spendSymbol,
    }),
  ).result.current;
}

describe("useFeePanel spendSymbol", () => {
  it("names the registry symbol when the form does not override it", () => {
    expect(feeLine(panel({}).model)).toContain("WETH");
  });

  it("names the moved asset as the form does, on every row", () => {
    // Native-ETH unshield: WETH notes are spent, ETH arrives.
    const { model } = panel({ spendSymbol: "ETH" });
    const line = feeLine(model);

    expect(line).toContain("ETH");
    expect(line).not.toContain("WETH");
    expect(model?.rows.every((r) => r.asset.symbol === "ETH")).toBe(true);
    // Both sides relabelled together, so the fee is still same-asset.
    expect(model?.crossAsset).toBe(false);
  });

  it("names it in a shortfall too, leaving other assets alone", () => {
    const { block } = panel({ spendSymbol: "ETH", affordable: false });

    expect(block && feeBlockReason(block)).toBe(
      "Not enough ETH to pay the relayer fee — pay it in USDC instead",
    );
  });
});

describe("useFeePanel on a deposit", () => {
  // The quote's `affordable` is about shielded notes; a deposit's relayer note is
  // funded from the public wallet, so a first shield must not read as short.
  it("reports no shortfall against shielded notes", () => {
    expect(panel({ kind: "deposit", affordable: false }).block).toBeUndefined();
  });
});
