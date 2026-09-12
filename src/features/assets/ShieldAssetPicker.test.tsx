// @vitest-environment jsdom
// The picker as rendered: held rows first in registry order, the rate column's
// wording, the chosen row marked, and Escape as a way back.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import { routerWrapper } from "@/test/render";
import { ethOption } from "./eth-option";
import { ShieldAssetPicker } from "./ShieldAssetPicker";

const { balances } = vi.hoisted(() => ({ balances: vi.fn() }));

const ASSETS = [
  makeAsset(1n, "WETH"),
  makeAsset(2n, "USDC", {
    decimals: 6,
    yieldEnabled: true,
    apy: { rate: 0.0418, windowDays: 9 },
    vaultName: "Steakhouse USDC",
  }),
  makeAsset(3n, "WBTC", { yieldEnabled: true, yieldHalted: true, decimals: 8 }),
];

vi.mock("@/features/chain", () => ({
  useActiveChain: () => ({ chainName: "Base", nativeAdapterAddress: "0xadapter" }),
}));
vi.mock("./registered-assets", async (orig) => ({
  ...(await orig<typeof import("./registered-assets")>()),
  useRegisteredAssets: () => ASSETS,
}));
vi.mock("./transparent-balances", () => ({ useDepositSourceBalances: balances }));

beforeEach(() => {
  // ETH (native), WETH, USDC, WBTC — in the order `shieldOptions` lists them.
  balances.mockReturnValue([0n, 0n, 8_420_000_000n, 940_000n]);
});

function renderPicker(value = "2") {
  const onChange = vi.fn();
  const onClose = vi.fn();
  render(<ShieldAssetPicker value={value} onChange={onChange} onClose={onClose} />, {
    wrapper: routerWrapper,
  });
  return { onChange, onClose };
}

const rowNames = () =>
  within(screen.getByRole("list"))
    .getAllByRole("button")
    .map((b) => b.querySelector(".apick__sym")?.firstChild?.textContent);

describe("ShieldAssetPicker", () => {
  it("lists held assets first, the rest in registry order", () => {
    renderPicker();
    expect(rowNames()).toEqual(["USDC", "WBTC", "ETH", "WETH"]);
    expect(screen.getByRole("heading", { name: "Choose an asset" })).toBeInTheDocument();
    expect(screen.getByText("Everything the pool accepts on Base")).toBeInTheDocument();
  });

  // The rate column's wording is `RateLabelView`'s; here, only that each row has one.
  it("states holdings beside each row's rate", () => {
    renderPicker();
    expect(screen.getByText("You hold 8,420.00")).toBeInTheDocument();
    expect(screen.getAllByText("Not held yet")).toHaveLength(2);
    expect(screen.getByText("4.18% / yr")).toBeInTheDocument();
  });

  it("names the vault an earning asset is supplied to", () => {
    renderPicker();
    const usdc = screen.getByText("USDC").closest("button") as HTMLElement;
    expect(usdc.querySelector(".apick__vault")).toHaveTextContent("· Steakhouse USDC");
  });

  it("marks the chosen row and reports a choice", () => {
    const { onChange } = renderPicker(ethOption(1n));
    const eth = screen.getAllByRole("button", { pressed: true });
    expect(eth).toHaveLength(1);
    fireEvent.click(screen.getByText("USDC").closest("button") as HTMLElement);
    expect(onChange).toHaveBeenCalledWith("2");
  });

  it("goes back on Escape", () => {
    const { onClose } = renderPicker();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
