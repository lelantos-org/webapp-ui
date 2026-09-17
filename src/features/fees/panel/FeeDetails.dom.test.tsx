import { RAY } from "@lelantos-org/sdk/protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { press } from "@/test/interact";
import type { FeeSummaryModel } from "../model/fee-summary";
import { FeeDetails } from "./FeeDetails";
import type { FeePanel } from "./use-fee-panel";

const USDC = { symbol: "USDC", decimals: 6 };

const model: FeeSummaryModel = {
  rows: [
    { key: "amount", label: "Amount", amount: 250_000_000n, asset: USDC, sign: "none" },
    { key: "relayer", label: "Relayer fee", amount: 250_000n, asset: USDC, sign: "plus" },
  ],
  total: undefined,
  headline: undefined,
  headlineExtra: undefined,
  crossAsset: false,
};

const option = (id: bigint, symbol: string, affordable: boolean) => ({
  id,
  symbol,
  decimals: 6,
  scale: 1n,
  index: RAY,
  amount: 250_000n,
  balance: affordable ? 10n ** 9n : 40_000n,
  affordable,
});

const panel = (over: Partial<FeePanel> = {}): FeePanel => ({
  model,
  refreshing: false,
  relayerAmount: 250_000n,
  feeAsset: undefined,
  block: undefined,
  pending: false,
  ...over,
});

const row = () => screen.getByRole("button", { name: /Details/ });

describe("FeeDetails", () => {
  it("collapses the fees into one resolved line", () => {
    render(<FeeDetails fees={panel()} />);
    expect(row()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Total fees 0.25 USDC · paid in USDC")).toBeInTheDocument();
  });

  it("takes a summary of the caller's own", () => {
    render(<FeeDetails fees={panel()} summary="Total fees ≈ $0.42" />);
    expect(screen.getByText("Total fees ≈ $0.42")).toBeInTheDocument();
  });

  it("opens on a shortfall, says so, and switches the fee asset in one tap", () => {
    const onChange = vi.fn();
    const shortfall = { ...option(1n, "USDC", false), alternative: { id: 2n, symbol: "ETH" } };
    render(
      <FeeDetails
        fees={panel({
          block: { kind: "shortfall", ...shortfall },
          feeAsset: {
            options: [option(1n, "USDC", false), option(2n, "ETH", true)],
            value: 1n,
            onChange,
          },
        })}
      />,
    );
    expect(row()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Relayer fee 0.25 USDC · you hold 0.04")).toBeInTheDocument();
    expect(
      screen.getByText("Not enough USDC to pay the relayer fee — pay it in ETH instead"),
    ).toBeInTheDocument();
    press("Pay the fee in ETH");
    expect(onChange).toHaveBeenCalledWith(2n);
  });

  it("offers a retry when the quote failed", () => {
    const retry = vi.fn();
    render(
      <FeeDetails
        fees={panel({
          model: undefined,
          block: { kind: "quote-failed", error: new Error("x"), retry },
        })}
      />,
    );
    press("Try again");
    expect(retry).toHaveBeenCalledOnce();
  });
});
