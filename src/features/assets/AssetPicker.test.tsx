import { RAY } from "@lelantos-org/sdk";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import { AssetPicker } from "./AssetPicker";
import { ethOption } from "./eth-option";

const { activeChain, registered } = vi.hoisted(() => ({
  activeChain: vi.fn(),
  registered: vi.fn(),
}));

vi.mock("@/features/chain", () => ({ useActiveChain: activeChain }));
vi.mock("./registered-assets", async (orig) => ({
  ...(await orig<typeof import("./registered-assets")>()),
  useRegisteredAssets: registered,
}));

function asset(id: bigint, symbol: string, over: Partial<RegisteredAsset> = {}): RegisteredAsset {
  return {
    id,
    token: `0x${id.toString().padStart(40, "0")}` as RegisteredAsset["token"],
    isWeth: symbol.toUpperCase() === "WETH",
    symbol,
    decimals: 18,
    scale: 1n,
    index: RAY,
    yieldEnabled: false,
    yieldHalted: false,
    ...over,
  };
}

// What `DeployTestYield` produces: the plain ids, then the same tokens again
// bound to a venue. Both WETH rows carry `isWeth`.
const PLAIN_WETH = asset(1n, "WETH");
const DAI = asset(2n, "mDAI");
const YIELD_WETH = asset(4n, "WETH", { yieldEnabled: true });

beforeEach(() => {
  activeChain.mockReturnValue({ nativeAdapterAddress: "0xadapter" });
  registered.mockReturnValue([PLAIN_WETH, DAI, YIELD_WETH]);
});

function optionNames(): string[] {
  return screen.getAllByRole("option").map((o) => o.textContent ?? "");
}

describe("AssetPicker", () => {
  it("offers a native option per WETH id, distinguished by the yield tag", () => {
    render(<AssetPicker showEth value={ethOption(1n)} onChange={vi.fn()} />);
    expect(optionNames()).toEqual([
      "ETH (native)",
      "ETH (native) · earning yield",
      "WETH",
      "mDAI",
      "WETH · earning yield",
    ]);
  });

  // The whole point of the per-id sentinel: picking the yield ETH row must not
  // resolve back to the first WETH in the registry.
  it("reports the id of the native option chosen, not the first WETH", async () => {
    const onChange = vi.fn();
    render(<AssetPicker showEth value={ethOption(1n)} onChange={onChange} />);
    await userEvent.selectOptions(
      screen.getByRole("combobox"),
      screen.getByRole("option", { name: "ETH (native) · earning yield" }),
    );
    expect(onChange).toHaveBeenCalledWith(ethOption(4n));
  });

  it("carries each native option's own WETH balance", () => {
    render(
      <AssetPicker
        showEth
        value={ethOption(1n)}
        onChange={vi.fn()}
        balanceOf={(a) => (a.id === 4n ? "9.5" : "1.25")}
      />,
    );
    expect(optionNames().slice(0, 2)).toEqual([
      "ETH (native) · 1.25",
      "ETH (native) · 9.5 · earning yield",
    ]);
  });

  it("withholds the native options on a chain with no adapter deployed", () => {
    activeChain.mockReturnValue({ nativeAdapterAddress: undefined });
    render(<AssetPicker showEth value="1" onChange={vi.fn()} />);
    expect(optionNames()).toEqual(["WETH", "mDAI", "WETH · earning yield"]);
  });

  it("omits the native options entirely unless asked for them", () => {
    render(<AssetPicker value="1" onChange={vi.fn()} />);
    expect(optionNames()).toEqual(["WETH", "mDAI", "WETH · earning yield"]);
  });
});
