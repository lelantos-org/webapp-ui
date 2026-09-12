// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { FeeRow, FeeSummaryModel } from "@/features/fees";
import {
  receiveLine,
  revertFootnote,
  slippagePct,
  swapDetailsLine,
  swapFeeSummary,
  venueLabel,
} from "./swap-copy";

const USDC = { symbol: "USDC", decimals: 6 };

const amountRow: FeeRow = {
  key: "amount",
  label: "Amount",
  amount: 1_000_000_000n,
  asset: USDC,
  sign: "none",
};
const relayer = (amount: bigint | undefined): FeeRow => ({
  key: "relayer",
  label: "Relayer fee",
  amount,
  asset: USDC,
  sign: "minus",
});
const model = (rows: FeeRow[]): FeeSummaryModel => ({
  rows: [amountRow, ...rows],
  total: undefined,
  headline: undefined,
  crossAsset: false,
});

describe("venueLabel", () => {
  it("names the venues the quoter routes through", () => {
    expect(venueLabel("univ3")).toBe("Uniswap v3");
    expect(venueLabel("univ4")).toBe("Uniswap v4");
  });

  it("shows an unknown venue as sent", () => {
    expect(venueLabel("curve")).toBe("curve");
  });
});

describe("slippagePct", () => {
  it("keeps two places under one percent", () => {
    expect(slippagePct(10)).toBe("0.10%");
    expect(slippagePct(50)).toBe("0.50%");
    expect(slippagePct(100)).toBe("1.0%");
  });
});

describe("swapDetailsLine", () => {
  it("states slippage alone before anything is typed", () => {
    expect(swapDetailsLine(50, undefined)).toBe("Max slippage 0.50%");
  });

  it("adds the relayer fee once it is priced", () => {
    expect(swapDetailsLine(50, model([relayer(1_200_000n)]))).toBe(
      "Max slippage 0.50% · fees 1.20 USDC",
    );
  });

  it("says the fee is still coming rather than a zero", () => {
    expect(swapFeeSummary(model([relayer(undefined)]))).toBe("fees…");
  });

  it("says when there is no fee at all", () => {
    expect(swapFeeSummary(model([]))).toBe("no fees");
  });

  it("keeps two tokens apart", () => {
    const eth = { symbol: "ETH", decimals: 18 };
    const m = model([
      { key: "protocol", label: "Protocol fee", amount: 250_000n, asset: USDC, sign: "minus" },
      { key: "relayer", label: "Relayer fee", amount: 10n ** 15n, asset: eth, sign: "minus" },
    ]);
    expect(swapFeeSummary(m)).toBe("fees 0.25 USDC + 0.001 ETH");
  });

  it("has a phone form", () => {
    expect(swapDetailsLine(100, undefined, { short: true })).toBe("Slippage 1.0%");
  });
});

describe("revertFootnote", () => {
  it("follows the chosen slippage", () => {
    expect(revertFootnote(10)).toBe(
      "The trade reverts if the price moves more than 0.10% before it executes.",
    );
  });
});

describe("receiveLine", () => {
  const base = { quoted: false, credited: false, error: null, stale: false, quoting: false };

  it.each([
    ["nothing asked", {}, "empty"],
    ["a request in flight", { quoting: true }, "fetching"],
    ["a failed request with nothing to show", { error: new Error("x") }, "quote-failed"],
    ["a quote still being sized", { quoted: true }, "pricing"],
    ["the credited figure", { quoted: true, credited: true }, "credited"],
    // A quote on screen outranks the failure of its refresh.
    [
      "a failed refresh over a quote",
      { quoted: true, credited: true, error: new Error("x") },
      "credited",
    ],
    ["an expired quote", { quoted: true, credited: true, stale: true }, "stale"],
  ] as const)("states %s", (_label, over, line) => {
    expect(receiveLine({ ...base, ...over })).toBe(line);
  });
});
