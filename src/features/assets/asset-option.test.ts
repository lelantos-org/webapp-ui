import { RAY } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import { assetOptionLabel, assetYieldTag } from "./asset-option";

function asset(over: Partial<RegisteredAsset> = {}): RegisteredAsset {
  return {
    id: 1n,
    token: "0x0000000000000000000000000000000000000001" as RegisteredAsset["token"],
    isWeth: false,
    symbol: "USDC",
    decimals: 6,
    scale: 1n,
    index: RAY,
    yieldEnabled: false,
    yieldHalted: false,
    ...over,
  };
}

describe("assetYieldTag", () => {
  it("marks nothing on an asset held as plain custody", () => {
    expect(assetYieldTag(asset())).toBeUndefined();
  });

  it("marks a yield asset as earning", () => {
    expect(assetYieldTag(asset({ yieldEnabled: true }))).toBe("earning yield");
  });

  // Halted is still a yield asset — backed, but no longer supplied — so it reads
  // differently from both an earning one and a plain one.
  it("marks a halted yield asset as paused", () => {
    expect(assetYieldTag(asset({ yieldEnabled: true, yieldHalted: true }))).toBe("yield paused");
  });
});

describe("assetOptionLabel", () => {
  it("joins the parts it is given", () => {
    expect(assetOptionLabel("USDC", "1,204.5", "earning yield")).toBe(
      "USDC · 1,204.5 · earning yield",
    );
  });

  it("drops an unknown balance rather than claiming a zero", () => {
    expect(assetOptionLabel("USDC", undefined, "earning yield")).toBe("USDC · earning yield");
  });

  it("leaves a plain asset with no balance as a bare name", () => {
    expect(assetOptionLabel("USDC", undefined, undefined)).toBe("USDC");
  });
});
