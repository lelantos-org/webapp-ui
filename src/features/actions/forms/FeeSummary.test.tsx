import { RAY } from "@lelantos-org/sdk/core";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FeeSummary } from "./FeeSummary";
import type { FeeSummaryModel } from "./fee-summary";

const USDC = { symbol: "USDC", decimals: 6 };

const model = (relayerFee: bigint | undefined): FeeSummaryModel => ({
  rows: [
    { key: "amount", label: "Amount", amount: 100_000_000n, asset: USDC, sign: "none" },
    { key: "relayer", label: "Relayer fee", amount: relayerFee, asset: USDC, sign: "plus" },
  ],
  total: undefined,
  headline: {
    key: "headline",
    label: "Recipient gets",
    amount: 100_000_000n,
    asset: USDC,
    sign: "none",
  },
  crossAsset: false,
});

const rowCount = () => document.querySelectorAll(".fees__row").length;

const asset = (id: bigint, symbol: string) => ({
  id,
  symbol,
  decimals: 6,
  scale: 1n,
  index: RAY,
  amount: 2_042n,
  balance: 10n ** 9n,
  affordable: true,
});

const twoAssets = {
  options: [asset(1n, "USDC"), asset(2n, "WETH")],
  value: 1n,
  onChange: () => {},
};

describe("FeeSummary", () => {
  it("holds a line open for a charge it cannot state yet", () => {
    render(<FeeSummary model={model(undefined)} />);
    expect(screen.getByText("Relayer fee")).toBeInTheDocument();
    expect(document.querySelector(".fees__skel")).toBeInTheDocument();
  });

  it("does not change height when the figure lands", () => {
    const { rerender } = render(<FeeSummary model={model(undefined)} />);
    const before = rowCount();
    rerender(<FeeSummary model={model(204_200n)} />);
    // Same rows, one of them now carrying a figure. The submit button sits
    // directly below, so a row appearing here moves it under the pointer.
    expect(rowCount()).toBe(before);
    expect(screen.getByText("+0.2042 USDC")).toBeInTheDocument();
    expect(document.querySelector(".fees__skel")).not.toBeInTheDocument();
  });

  it("collapses rather than vanishing when the amount is cleared", async () => {
    const { rerender } = render(<FeeSummary model={model(204_200n)} />);
    rerender(<FeeSummary model={undefined} />);

    // Still mounted, so there is something to animate away — and marked hidden,
    // so a screen reader is not read a panel that is on its way out.
    const slot = document.querySelector(".fees-slot");
    expect(slot).toBeInTheDocument();
    expect(slot).not.toHaveClass("fees-slot--open");
    expect(slot).toHaveAttribute("aria-hidden", "true");

    await act(() => new Promise((r) => setTimeout(r, 260)));
    expect(document.querySelector(".fees-slot")).not.toBeInTheDocument();
  });

  it("marks a re-price without moving anything", () => {
    const { rerender } = render(<FeeSummary model={model(204_200n)} />);
    const before = rowCount();
    rerender(<FeeSummary model={model(204_200n)} refreshing />);
    expect(rowCount()).toBe(before);
    expect(screen.getByText("+0.2042 USDC")).toBeInTheDocument();
    expect(document.querySelector(".fees__bar--on")).toBeInTheDocument();
  });

  it("opens the asset picker clear of the wrapper that clips the panel", async () => {
    // The panel animates its own height through `overflow: hidden`, which
    // clipped the picker's list to the panel — and the list is taller than the
    // panel by design. Leaving the subtree is the only way to escape the clip.
    render(<FeeSummary model={model(204_200n)} feeAsset={twoAssets} />);
    await userEvent.click(screen.getByRole("button"));

    const list = screen.getByRole("listbox");
    expect(list).toBeInTheDocument();
    expect(document.querySelector(".fees-slot__inner")?.contains(list)).toBe(false);
  });

  it("closes the picker when the panel is dismissed under it", async () => {
    const { rerender } = render(<FeeSummary model={model(204_200n)} feeAsset={twoAssets} />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // The list is portalled, so nothing about it unmounts with the panel on its
    // own — it has to go because the control that owns it does.
    rerender(<FeeSummary model={undefined} feeAsset={twoAssets} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  describe("a sum against dust", () => {
    // The reported case: withdrawing 1 WETH, 0.25% protocol fee, and a relayer
    // fee small enough that the default six-place cap swallows it. The total
    // printed as "0.0025" — the protocol fee alone — so the panel read as
    // though it had dropped a fee it had just listed a line above.
    const WEI = 10n ** 18n;
    const PROTOCOL = WEI / 400n;
    const RELAYER = 20_000_000_000n;
    const WETH = { symbol: "WETH", decimals: 18 };

    const withdrawal = (): FeeSummaryModel => ({
      rows: [
        { key: "amount", label: "Amount", amount: WEI, asset: WETH, sign: "none" },
        {
          key: "protocol",
          label: "Protocol fee (0.25%)",
          amount: PROTOCOL,
          asset: WETH,
          sign: "minus",
        },
        { key: "relayer", label: "Relayer fee", amount: RELAYER, asset: WETH, sign: "plus" },
      ],
      total: {
        key: "total",
        label: "Total fees",
        amount: PROTOCOL + RELAYER,
        asset: WETH,
        sign: "none",
      },
      headline: {
        key: "headline",
        label: "You receive",
        amount: WEI - PROTOCOL,
        asset: WETH,
        sign: "none",
      },
      crossAsset: false,
    });

    it("states a total that its own rows add up to", () => {
      render(<FeeSummary model={withdrawal()} />);
      expect(screen.getByText("−0.0025 WETH")).toBeInTheDocument();
      expect(screen.getByText("+0.00000002 WETH")).toBeInTheDocument();
      expect(screen.getByText("0.00250002 WETH")).toBeInTheDocument();
    });

    it("leaves a figure no dust contributed to alone", () => {
      // The relayer fee is funded from shielded change, not skimmed off
      // `publicOut`, so it is not in this one — and it must not drag trailing
      // precision onto it either.
      render(<FeeSummary model={withdrawal()} />);
      expect(screen.getByText("0.9975 WETH")).toBeInTheDocument();
    });

    it("carries the dust into a deposit's bottom line, which does include it", () => {
      const m = withdrawal();
      render(
        <FeeSummary
          model={{
            ...m,
            headline: {
              key: "headline",
              label: "You pay",
              amount: WEI + PROTOCOL + RELAYER,
              asset: WETH,
              sign: "none",
            },
          }}
        />,
      );
      expect(screen.getByText("1.00250002 WETH")).toBeInTheDocument();
    });
  });

  it("offers no picker for a relayer that takes one asset", () => {
    const one = {
      options: [
        {
          id: 1n,
          symbol: "USDC",
          decimals: 6,
          scale: 1n,
          index: RAY,
          amount: 2_042n,
          balance: 10n ** 9n,
          affordable: true,
        },
      ],
      value: 1n,
      onChange: () => {},
    };
    render(<FeeSummary model={model(204_200n)} feeAsset={one} />);
    // One option is a label, not a choice.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
