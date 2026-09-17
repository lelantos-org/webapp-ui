import { describe, expect, it } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import { ethOption } from "./eth-option";
import { heldFirst, shieldOptions } from "./shield-asset-options";

const WETH = makeAsset(1n, "WETH");
const USDC = makeAsset(2n, "USDC", {
  decimals: 6,
  yieldEnabled: true,
  apy: { rate: 0.0418, windowDays: 9 },
});
const DAI = makeAsset(3n, "DAI", { yieldEnabled: true, apy: { rate: 0.0391, windowDays: 30 } });
const WBTC = makeAsset(4n, "WBTC", { yieldEnabled: true, yieldHalted: true });

describe("shieldOptions", () => {
  it("lists native coin first, then the registry in its own order", () => {
    const rows = shieldOptions([WETH, USDC, DAI, WBTC], true);
    expect(rows.map((r) => r.symbol)).toEqual(["ETH", "WETH", "USDC", "DAI", "WBTC"]);
    expect(rows[0]).toMatchObject({ value: ethOption(1n), asEth: true, decimals: 18 });
    expect(rows[2]).toMatchObject({ value: "2", asEth: false, decimals: 6 });
  });

  it("offers no native row where the chain has no adapter", () => {
    expect(shieldOptions([WETH, USDC], false).map((r) => r.symbol)).toEqual(["WETH", "USDC"]);
  });
});

describe("heldFirst", () => {
  const rows = shieldOptions([WETH, USDC, DAI, WBTC], false);
  const balances = new Map<string, bigint | undefined>([
    ["WETH", 0n],
    ["USDC", 8_420n],
    ["DAI", undefined],
    ["WBTC", 94n],
  ]);

  it("moves held rows up without reordering either group", () => {
    const ordered = heldFirst(rows, (r) => balances.get(r.symbol));
    expect(ordered.map((r) => r.symbol)).toEqual(["USDC", "WBTC", "WETH", "DAI"]);
  });

  it("never ranks by rate: DAI's lower rate does not move it below an unrated asset", () => {
    const none = heldFirst(rows, () => undefined);
    expect(none.map((r) => r.symbol)).toEqual(["WETH", "USDC", "DAI", "WBTC"]);
  });
});
