import { RAY } from "@lelantos-org/sdk/protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { press } from "@/test/interact";
import { AmountHero, type AmountHeroProps } from "./AmountHero";

vi.mock("@/features/assets", () => ({
  usePrices: () => new Map(),
  assetUsd: () => 250,
}));
vi.mock("@/features/wallet", () => ({ preloadProverWorker: () => Promise.resolve() }));

const USDC = { symbol: "USDC", decimals: 6, scale: 1n, index: RAY, token: "0xusdc" };
const valid = { tooLarge: false, insufficient: false, feeUnknown: false, valid: true };

const props = (over: Partial<AmountHeroProps> = {}): AmountHeroProps => ({
  inputProps: { name: "amount", onChange: async () => {}, onBlur: async () => {}, ref: () => {} },
  label: "You send",
  selected: USDC,
  value: "250",
  amount: 250_000_000n,
  maxAmount: 3_180_000_000n,
  onSetMax: () => {},
  validation: valid,
  balanceLabel: "Shielded",
  balance: "8,420.00 USDC",
  ...over,
});

describe("AmountHero", () => {
  it("writes the amount twice, and prices it", () => {
    render(<AmountHero {...props()} />);
    const input = screen.getByLabelText("You send");
    expect(screen.getByText("Two hundred fifty and 00/100 USDC")).toBeInTheDocument();
    expect(input.getAttribute("aria-describedby")).toContain(
      screen.getByText("Two hundred fifty and 00/100 USDC").id,
    );
    expect(screen.getByText("≈ $250.00")).toBeInTheDocument();
    expect(screen.getByText("8,420.00 USDC")).toBeInTheDocument();
  });

  it("writes the ceiling, not the balance, when Max is pressed", () => {
    const onSetMax = vi.fn();
    render(<AmountHero {...props({ onSetMax })} />);
    press("Max");
    expect(onSetMax).toHaveBeenCalledWith("3,180");
  });

  it("withholds Max without a ceiling", () => {
    render(<AmountHero {...props({ maxAmount: undefined })} />);
    expect(screen.queryByRole("button", { name: "Max" })).not.toBeInTheDocument();
  });

  it("marks the field invalid and says why", () => {
    render(
      <AmountHero {...props({ validation: { ...valid, insufficient: true, valid: false } })} />,
    );
    expect(screen.getByLabelText("You send")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("More than you hold")).toBeInTheDocument();
  });

  it("shows no words and no dollars for nothing typed", () => {
    render(<AmountHero {...props({ value: "", amount: undefined })} />);
    expect(screen.queryByText(/and 00\/100/)).not.toBeInTheDocument();
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });
});
