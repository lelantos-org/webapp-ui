import { RAY } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import { defaultSwapOut } from "./default-pair";

function asset(id: bigint, symbol: string): RegisteredAsset {
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
  };
}

describe("defaultSwapOut", () => {
  it("picks the first asset that is not the from-side default", () => {
    expect(defaultSwapOut([asset(1n, "WETH"), asset(2n, "mDAI")])).toBe("2");
  });

  // The regression this replaces: the out-side was the literal "2", so a chain
  // whose registry skips that id resolved to no asset, and the form silently
  // never built a quote request.
  it("does not assume asset id 2 exists", () => {
    expect(defaultSwapOut([asset(1n, "WETH"), asset(7n, "USDC"), asset(9n, "WBTC")])).toBe("7");
  });

  it("skips the default wherever it sits in the list", () => {
    expect(defaultSwapOut([asset(5n, "USDC"), asset(1n, "WETH")])).toBe("5");
  });

  it("falls back to the default when the chain has one asset", () => {
    // No valid pair exists. Returning the from-side default leaves the pair
    // matching, which is what keeps the quote request undefined and the form
    // inert — the honest outcome for a chain that cannot swap.
    expect(defaultSwapOut([asset(1n, "WETH")])).toBe("1");
  });

  it("falls back to the default for an empty registry", () => {
    expect(defaultSwapOut([])).toBe("1");
  });
});
