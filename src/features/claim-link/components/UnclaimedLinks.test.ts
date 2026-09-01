// The recovery list renders amounts pulled off disk, where the asset registry
// that gives them meaning is not guaranteed to still contain the asset.

import { evmAddress, RAY } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import type { StoredClaimLink } from "../link-vault";
import { describeStoredAmount } from "./UnclaimedLinks";

const USDC: RegisteredAsset = {
  id: 1n,
  token: evmAddress("0x0000000000000000000000000000000000000001"),
  isWeth: false,
  symbol: "USDC",
  decimals: 6,
  scale: 1n,
  // Plain custody: one unit is worth `scale` forever.
  index: RAY,
  yieldEnabled: false,
  yieldHalted: false,
};

const link = (over: Partial<StoredClaimLink> = {}): StoredClaimLink => ({
  id: "r1",
  url: "https://app/claim#deadbeef",
  chainId: "31337",
  assetId: "1",
  amount: "2500000",
  createdAt: 1_767_225_600_000,
  ...over,
});

describe("describeStoredAmount", () => {
  it("denominates a registered asset", () => {
    expect(describeStoredAmount(link(), [USDC])).toBe("2.5 USDC");
  });

  it("scales circuit units by the asset's scale", () => {
    const scaled: RegisteredAsset = { ...USDC, id: 2n, symbol: "WBTC", decimals: 8, scale: 100n };

    expect(describeStoredAmount(link({ assetId: "2", amount: "1000000" }), [scaled])).toBe(
      "1 WBTC",
    );
  });

  it("labels the raw figure when the asset is not registered on this chain", () => {
    // A chain whose token list differs — or an indexer that has not caught up —
    // makes the lookup miss. Printing "2500000" bare put a number six orders of
    // magnitude off right beside properly denominated ones.
    expect(describeStoredAmount(link({ assetId: "9" }), [USDC])).toBe("2500000 (asset #9)");
  });

  it("does not throw on an empty registry", () => {
    expect(describeStoredAmount(link(), [])).toBe("2500000 (asset #1)");
  });
});
