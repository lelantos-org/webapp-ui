import type { NameFee } from "@lelantos-org/sdk/advanced";
import { describe, expect, it } from "vitest";
import { makeAsset, USDC_ASSET } from "@/test/fixtures/assets";
import { type Funding, fundingOf, fundingProblem, fundingShortfall } from "./funding";

const YUSDC = makeAsset(2n, "yUSDC", { decimals: 6, token: USDC_ASSET.token, yieldEnabled: true });
const DAI = makeAsset(3n, "DAI");
const ZERO = "0x0000000000000000000000000000000000000000";
const fee = (amount: bigint, token: string = USDC_ASSET.token) => ({ token, amount }) as NameFee;
const FREE = fee(0n, ZERO);
const none = () => 0n;

describe("fundingOf", () => {
  it("pays from the plain asset of the registrar's fee token, whatever the address's case", () => {
    const upper = fee(5_000_000n, USDC_ASSET.token.toUpperCase().replace("0X", "0x"));
    expect(fundingOf(upper, [YUSDC, DAI, USDC_ASSET], none)).toEqual({
      kind: "fee-token",
      asset: USDC_ASSET,
    });
  });

  it("does not let a pick override the fee token's asset", () => {
    expect(fundingOf(fee(5_000_000n), [USDC_ASSET, DAI], none, DAI.id)).toEqual({
      kind: "fee-token",
      asset: USDC_ASSET,
    });
  });

  it("is unavailable where the fee token is only a yield asset, or not a pool asset at all", () => {
    for (const assets of [[YUSDC, DAI], [DAI], []]) {
      expect(fundingOf(fee(5_000_000n), assets, none)).toEqual({
        kind: "unavailable",
        reason: expect.stringContaining("fee token is not a pool asset here"),
      });
    }
  });

  it("defaults a free registration to the first plain asset the wallet holds", () => {
    const held = (id: bigint) => (id === DAI.id || id === YUSDC.id ? 9n : 0n);
    expect(fundingOf(FREE, [YUSDC, USDC_ASSET, DAI], held)).toEqual({
      kind: "choice",
      asset: DAI,
      options: [USDC_ASSET, DAI],
    });
  });

  it("takes the user's pick for a free registration, among plain assets only", () => {
    const held = (id: bigint) => (id === DAI.id ? 9n : 0n);
    const assets = [YUSDC, USDC_ASSET, DAI];
    expect(fundingOf(FREE, assets, held, USDC_ASSET.id)).toMatchObject({ asset: USDC_ASSET });
    expect(fundingOf(FREE, assets, held, YUSDC.id)).toMatchObject({ asset: DAI });
  });

  it("has no asset for a free registration while the wallet holds none", () => {
    expect(fundingOf(FREE, [YUSDC, USDC_ASSET, DAI], none)).toEqual({
      kind: "choice",
      asset: undefined,
      options: [USDC_ASSET, DAI],
    });
  });

  it("is unavailable for a free registration where every asset earns yield", () => {
    expect(fundingOf(FREE, [YUSDC], none).kind).toBe("unavailable");
  });
});

describe("fundingShortfall", () => {
  it("asks for more than the registrar's fee", () => {
    expect(fundingShortfall(fee(5_000_000n), USDC_ASSET, 4_999_999n)).toContain("5.00 USDC");
    expect(fundingShortfall(fee(5_000_000n), USDC_ASSET, 5_000_000n)).toBeDefined();
    expect(fundingShortfall(fee(5_000_000n), USDC_ASSET, 5_000_001n)).toBeUndefined();
  });

  it("compares in base units, not circuit units", () => {
    const WETH = makeAsset(4n, "WETH", { scale: 10n ** 12n });
    expect(fundingShortfall(fee(10n ** 15n), WETH, 999n)).toBeDefined();
    expect(fundingShortfall(fee(10n ** 15n), WETH, 1_001n)).toBeUndefined();
  });

  it("asks a free registration only for something to pay the relayer with", () => {
    expect(fundingShortfall(FREE, USDC_ASSET, 0n)).toContain("pay the relayer");
    expect(fundingShortfall(FREE, USDC_ASSET, 1n)).toBeUndefined();
  });
});

describe("fundingProblem", () => {
  const paid: Funding = { kind: "fee-token", asset: USDC_ASSET };

  it("names the shortfall of the funding asset", () => {
    expect(fundingProblem(fee(5_000_000n), paid, 1_000_000n)).toBe(
      "You need more than 5.00 USDC shielded to pay the registrar and the relayer",
    );
    expect(fundingProblem(fee(5_000_000n), paid, 9_000_000n)).toBeUndefined();
  });

  it("holds nothing back while the balance is not known", () => {
    expect(fundingProblem(fee(5_000_000n), paid, undefined)).toBeUndefined();
  });

  it("asks for shielded funds where a free registration has no asset to be paid from", () => {
    const nothingHeld: Funding = { kind: "choice", asset: undefined, options: [USDC_ASSET, DAI] };
    expect(fundingProblem(FREE, nothingHeld, undefined)).toBe(
      "You need shielded funds to pay the relayer",
    );
  });

  it("checks a free registration's picked asset like any other", () => {
    const fromDai: Funding = { kind: "choice", asset: DAI, options: [USDC_ASSET, DAI] };
    expect(fundingProblem(FREE, fromDai, 0n)).toBe("You need some shielded DAI to pay the relayer");
    expect(fundingProblem(FREE, fromDai, 1n)).toBeUndefined();
  });

  it("has nothing to add where no asset could pay at all", () => {
    expect(fundingProblem(FREE, { kind: "unavailable", reason: "none" }, 0n)).toBeUndefined();
  });
});
