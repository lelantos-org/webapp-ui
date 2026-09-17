import { RAY } from "@lelantos-org/sdk/protocol";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { FeeSummaryModel } from "../model/fee-summary";
import { FeeSummary } from "./FeeSummary";

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
  headlineExtra: undefined,
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
    render(<FeeSummary variant="details" model={model(undefined)} />);
    expect(screen.getByText("Relayer fee")).toBeInTheDocument();
    expect(document.querySelector(".fees__skel")).toBeInTheDocument();
  });

  it("does not change height when the figure lands", () => {
    const { rerender } = render(<FeeSummary variant="details" model={model(undefined)} />);
    const before = rowCount();
    rerender(<FeeSummary variant="details" model={model(204_200n)} />);
    expect(rowCount()).toBe(before);
    expect(screen.getByText("+0.2042 USDC")).toBeInTheDocument();
    expect(document.querySelector(".fees__skel")).not.toBeInTheDocument();
  });

  it("says what it needs rather than drawing empty rows before an amount", () => {
    render(<FeeSummary variant="details" model={undefined} />);
    expect(screen.getByText("Enter an amount to see what it costs.")).toBeInTheDocument();
    expect(rowCount()).toBe(0);
  });

  it("marks a re-price without moving anything", () => {
    const { rerender } = render(<FeeSummary variant="details" model={model(204_200n)} />);
    const before = rowCount();
    rerender(<FeeSummary variant="details" model={model(204_200n)} refreshing />);
    expect(rowCount()).toBe(before);
    expect(screen.getByText("+0.2042 USDC")).toBeInTheDocument();
    expect(document.querySelector(".fees__bar--on")).toBeInTheDocument();
  });

  it("opens the asset picker clear of the rows it sits in", async () => {
    render(<FeeSummary variant="details" model={model(204_200n)} feeAsset={twoAssets} />);
    await userEvent.click(screen.getByRole("button"));

    const list = screen.getByRole("listbox");
    expect(list).toBeInTheDocument();
    expect(document.querySelector(".fees")?.contains(list)).toBe(false);
  });

  it("closes the picker when the panel is dismissed under it", async () => {
    const { rerender } = render(
      <FeeSummary variant="details" model={model(204_200n)} feeAsset={twoAssets} />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    rerender(<FeeSummary variant="details" model={undefined} feeAsset={twoAssets} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  describe("a sum against dust", () => {
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
      headlineExtra: undefined,
      crossAsset: false,
    });

    it("states a total that its own rows add up to", () => {
      render(<FeeSummary variant="details" model={withdrawal()} />);
      expect(screen.getByText("−0.0025 WETH")).toBeInTheDocument();
      expect(screen.getByText("+0.00000002 WETH")).toBeInTheDocument();
      expect(screen.getByText("0.00250002 WETH")).toBeInTheDocument();
    });

    it("leaves a figure no dust contributed to alone", () => {
      render(<FeeSummary variant="details" model={withdrawal()} />);
      expect(screen.getByText("0.9975 WETH")).toBeInTheDocument();
    });

    it("carries the dust into a deposit's bottom line, which does include it", () => {
      const m = withdrawal();
      render(
        <FeeSummary
          variant="details"
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

  it("states a cross-asset deposit's bottom line per token", () => {
    const DAI = { symbol: "DAI", decimals: 18 };
    render(
      <FeeSummary
        variant="details"
        model={{
          rows: [
            { key: "amount", label: "Amount", amount: 100_000_000n, asset: USDC, sign: "none" },
            {
              key: "relayer",
              label: "Relayer fee",
              amount: 42n * 10n ** 16n,
              asset: DAI,
              sign: "plus",
            },
          ],
          total: undefined,
          headline: {
            key: "headline",
            label: "You pay",
            amount: 100_000_000n,
            asset: USDC,
            sign: "none",
          },
          headlineExtra: {
            key: "headline-relayer",
            label: "Relayer fee",
            amount: 42n * 10n ** 16n,
            asset: DAI,
            sign: "none",
          },
          crossAsset: true,
        }}
      />,
    );
    const bottom = document.querySelector(".fees__headline");
    expect(bottom?.textContent).toBe("You pay100 USDC+0.42 DAI");
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
    render(<FeeSummary variant="details" model={model(204_200n)} feeAsset={one} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("FeeSummary variants", () => {
  const withdrawal = (): FeeSummaryModel => ({
    rows: [
      { key: "amount", label: "Amount", amount: 500_000_000n, asset: USDC, sign: "none" },
      {
        key: "protocol",
        label: "Protocol fee (0.25%)",
        amount: 1_250_000n,
        asset: USDC,
        sign: "minus",
        rate: "0.25%",
      },
      { key: "relayer", label: "Relayer fee", amount: 310_000n, asset: USDC, sign: "plus" },
    ],
    total: undefined,
    headline: undefined,
    headlineExtra: undefined,
    crossAsset: false,
  });

  it("itemises a review at two places, naming how each fee is charged", () => {
    render(
      <FeeSummary
        variant="review"
        model={withdrawal()}
        extraRows={[{ label: "They receive", value: "498.75 USDC", strong: true }]}
      />,
    );
    expect(screen.getByText("500.00 USDC")).toBeInTheDocument();
    expect(screen.getByText("Protocol fee · 0.25%")).toBeInTheDocument();
    expect(screen.getByText("1.25 USDC")).toBeInTheDocument();
    expect(screen.getByText("Relayer fee · paid in USDC")).toBeInTheDocument();
    expect(screen.getByText("0.31 USDC")).toBeInTheDocument();
    expect(screen.getByText("498.75 USDC")).toBeInTheDocument();
  });
});
