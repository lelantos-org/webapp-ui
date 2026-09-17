import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type AssetOverrides, makeAsset } from "@/test/fixtures/assets";
import {
  type AssetSelectOptionsInputs,
  assetOptionLabel,
  assetSelectOptions,
  useAssetSelectOptions,
} from "./asset-option";
import { ethOption } from "./eth-option";

const { chain, shielded } = vi.hoisted(() => ({
  chain: { nativeAdapterAddress: "0xadapter" as string | undefined },
  shielded: { data: undefined as { balances: { asset: bigint; balance: bigint }[] } | undefined },
}));

vi.mock("@/features/chain", () => ({ useActiveChain: () => chain }));
vi.mock("../registry/registered-assets", async (orig) => ({
  ...(await orig<typeof import("../registry/registered-assets")>()),
  useRegisteredAssets: () => [PLAIN_WETH, DAI, YIELD_WETH],
}));
vi.mock("../balances/use-balances", () => ({ useBalances: () => shielded }));

const asset = (over: AssetOverrides = {}) => makeAsset(1n, "USDC", { decimals: 6, ...over });

describe("assetOptionLabel", () => {
  it("joins the parts it is given, dropping an unknown balance rather than claiming a zero", () => {
    expect(assetOptionLabel("USDC", "1,204.5", "4.18% / yr · 9d")).toBe(
      "USDC · 1,204.5 · 4.18% / yr · 9d",
    );
    expect(assetOptionLabel("USDC", undefined, "does not earn")).toBe("USDC · does not earn");
    expect(assetOptionLabel("USDC", undefined, undefined)).toBe("USDC");
  });
});

const PLAIN_WETH = makeAsset(1n, "WETH");
const DAI = makeAsset(2n, "mDAI");
const YIELD_WETH = makeAsset(4n, "WETH", {
  yieldEnabled: true,
  apy: { rate: 0.0312, windowDays: 7 },
});
const REGISTRY = [PLAIN_WETH, DAI, YIELD_WETH];

const labels = (inputs: AssetSelectOptionsInputs) =>
  assetSelectOptions(REGISTRY, inputs).map((o) => o.label);

describe("assetSelectOptions", () => {
  it("offers a native option per WETH id, distinguished by the rate tag", () => {
    expect(labels({ showEth: true, nativeEthSupported: true })).toEqual([
      "ETH (native) · does not earn",
      "ETH (native) · 3.12% / yr · 7d",
      "WETH · does not earn",
      "mDAI · does not earn",
      "WETH · 3.12% / yr · 7d",
    ]);
  });

  it("names each native option by the id it spends through, drawn as ETH", () => {
    const options = assetSelectOptions(REGISTRY, { showEth: true, nativeEthSupported: true });
    expect(options.slice(0, 3)).toEqual([
      expect.objectContaining({ value: ethOption(1n), symbol: "ETH", address: undefined }),
      expect.objectContaining({ value: ethOption(4n), symbol: "ETH", address: undefined }),
      expect.objectContaining({ value: "1", symbol: "WETH", address: PLAIN_WETH.token }),
    ]);
  });

  it("carries each native option's own WETH balance", () => {
    const balance = (a: { id: bigint }) => (a.id === 4n ? "9.5" : "1.25");
    expect(
      labels({ showEth: true, nativeEthSupported: true, balanceOf: balance }).slice(0, 2),
    ).toEqual(["ETH (native) · 1.25 · does not earn", "ETH (native) · 9.5 · 3.12% / yr · 7d"]);
  });

  it("offers native options only when asked for and the chain has an adapter", () => {
    const tokens = ["WETH · does not earn", "mDAI · does not earn", "WETH · 3.12% / yr · 7d"];
    expect(labels({ showEth: true, nativeEthSupported: false })).toEqual(tokens);
    expect(labels({ nativeEthSupported: true })).toEqual(tokens);
  });

  it("lists the bare symbol and balance where no rate is wanted", () => {
    const balance = (a: { id: bigint }) => (a.id === 2n ? "3" : undefined);
    expect(labels({ rateTag: false, balanceOf: balance })).toEqual(["WETH", "mDAI · 3", "WETH"]);
  });

  it("names the vault of an earning asset so it reads apart from its plain twin", () => {
    const options = assetSelectOptions(
      [
        asset(),
        makeAsset(2n, "USDC", { decimals: 6, yieldEnabled: true, vaultName: "Steakhouse USDC" }),
      ],
      { rateTag: false },
    );
    expect(options.map((o) => o.label)).toEqual(["USDC", "USDC · Steakhouse USDC"]);
    expect(options.map((o) => o.symbol)).toEqual(["USDC", "USDC"]);
  });
});

describe("useAssetSelectOptions", () => {
  it("reads the registry, the balances and the chain's native adapter", () => {
    shielded.data = { balances: [{ asset: 1n, balance: 2n * 10n ** 18n }] };
    chain.nativeAdapterAddress = "0xadapter";
    const withAdapter = renderHook(() => useAssetSelectOptions({ showEth: true }));
    expect(withAdapter.result.current.map((o) => o.label).slice(0, 3)).toEqual([
      "ETH (native) · 2 · does not earn",
      "ETH (native) · 0 · 3.12% / yr · 7d",
      "WETH · 2 · does not earn",
    ]);

    chain.nativeAdapterAddress = undefined;
    const without = renderHook(() => useAssetSelectOptions({ showEth: true }));
    expect(without.result.current.map((o) => o.symbol)).toEqual(["WETH", "mDAI", "WETH"]);
  });

  it("labels bare symbols until a sync has succeeded, rather than claiming zeros", () => {
    shielded.data = undefined;
    const { result } = renderHook(() => useAssetSelectOptions({ rateTag: false }));
    expect(result.current.map((o) => o.label)).toEqual(["WETH", "mDAI", "WETH"]);
  });
});
