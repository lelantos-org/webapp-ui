import { RAY } from "@lelantos-org/sdk/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FeeAssetPicker } from "./FeeAssetPicker";
import type { FeeAssetOption } from "./use-fee-panel";

// 6-decimal tokens at scale 100, so a display that forgot to scale circuit
// units into base units shows up in the text.
const option = (id: bigint, symbol: string, amount: bigint, balance: bigint): FeeAssetOption => ({
  id,
  symbol,
  decimals: 6,
  scale: 100n,
  index: RAY,
  amount,
  balance,
  affordable: balance >= amount,
});

const USDC = option(1n, "USDC", 2_000n, 1_000_000n);
const WETH = option(2n, "WETH", 1_000n, 5_000_000n);
const DAI = option(3n, "DAI", 4_000n, 1_000n);

function setup(onChange = vi.fn()) {
  render(<FeeAssetPicker choice={{ options: [USDC, WETH, DAI], value: 1n, onChange }} />);
  return { onChange, trigger: screen.getByRole("button") };
}

describe("FeeAssetPicker", () => {
  it("names the current asset before it is opened", () => {
    const { trigger } = setup();
    expect(trigger).toHaveTextContent("USDC");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("states the cost in each asset, not the circuit units it is quoted in", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    // 2_000 circuit units × scale 100 = 200_000 base = 0.2 at 6 decimals.
    expect(screen.getByRole("option", { name: /USDC/ })).toHaveTextContent("0.2");
    expect(screen.getByRole("option", { name: /WETH/ })).toHaveTextContent("0.1");
  });

  it("picks with the keyboard, arrow keys landing on the current asset first", async () => {
    const { onChange, trigger } = setup();
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    // Opened on USDC, the selected one; one step down is WETH.
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(2n);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows an asset the wallet cannot cover, and refuses to select it", async () => {
    const { onChange, trigger } = setup();
    await userEvent.click(trigger);
    const dai = screen.getByRole("option", { name: /DAI/ });
    // 4_000 - 1_000 circuit units = 3_000 × 100 = 0.3 at 6 decimals.
    expect(dai).toHaveTextContent("needs 0.3 more");
    expect(dai).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(dai);
    expect(onChange).not.toHaveBeenCalled();
    // Still open: a click that did nothing must not read as one that worked.
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("closes on Escape and puts focus back on the trigger", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on a click outside it", async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await userEvent.click(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
