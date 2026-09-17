import { RAY } from "@lelantos-org/sdk/protocol";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FeeAssetOption } from "../model/fee-block";
import { FeeAssetPicker } from "./FeeAssetPicker";

// Scale 100, so a display that skips circuit-to-base scaling shows in the text.
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
    expect(screen.getByRole("option", { name: /USDC/ })).toHaveTextContent("0.2");
    expect(screen.getByRole("option", { name: /WETH/ })).toHaveTextContent("0.1");
  });

  it("picks with the keyboard, arrow keys landing on the current asset first", async () => {
    const { onChange, trigger } = setup();
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(2n);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows an asset the wallet cannot cover, and refuses to select it", async () => {
    const { onChange, trigger } = setup();
    await userEvent.click(trigger);
    const dai = screen.getByRole("option", { name: /DAI/ });
    expect(dai).toHaveTextContent("needs 0.3 more");
    expect(dai).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(dai);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("states a balance still being read as unknown", async () => {
    const unread: FeeAssetOption = { ...DAI, balance: undefined, affordable: true };
    render(<FeeAssetPicker choice={{ options: [USDC, unread], value: 1n, onChange: vi.fn() }} />);
    await userEvent.click(screen.getByRole("button"));
    const dai = screen.getByRole("option", { name: /DAI/ });
    expect(dai).toHaveTextContent("balance …");
    expect(dai).toHaveAttribute("aria-disabled", "false");
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
