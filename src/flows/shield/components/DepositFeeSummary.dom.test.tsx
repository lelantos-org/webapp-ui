import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FeePanel, FeeSummaryModel } from "@/features/fees";
import { DepositFeeSummary } from "./DepositFeeSummary";

vi.mock("@/features/assets", () => ({
  usePrices: () => new Map(),
  priceOf: () => 1,
}));

const USDC = { symbol: "USDC", decimals: 6, token: "0xusdc" };
const DAI = { symbol: "DAI", decimals: 18, token: "0xdai" };

function panel(relayerAsset: typeof USDC): FeePanel {
  const model: FeeSummaryModel = {
    rows: [
      { key: "amount", label: "Amount", amount: 100_000_000n, asset: USDC, sign: "none" },
      { key: "protocol", label: "Protocol fee", amount: 300_000n, asset: USDC, sign: "plus" },
      {
        key: "relayer",
        label: "Relayer fee",
        amount: relayerAsset === DAI ? 42n * 10n ** 16n : 420_000n,
        asset: relayerAsset,
        sign: "plus",
      },
    ],
    total: undefined,
    headline: undefined,
    headlineExtra: undefined,
    crossAsset: relayerAsset !== USDC,
  };
  return {
    model,
    refreshing: false,
    relayerAmount: 0n,
    feeAsset: undefined,
    block: undefined,
    pending: false,
  };
}

describe("DepositFeeSummary", () => {
  it("states same-token fees in dollars", () => {
    const { container } = render(<DepositFeeSummary fees={panel(USDC)} />);
    expect(container.textContent).toContain("≈ $0.72");
  });

  it("states a relayer paid in another token per token, not as one dollar figure", () => {
    const { container } = render(<DepositFeeSummary fees={panel(DAI)} />);
    expect(container.textContent).toContain("0.30 USDC + 0.42 DAI · relayer paid in DAI");
    expect(container.textContent).not.toContain("$");
  });
});
