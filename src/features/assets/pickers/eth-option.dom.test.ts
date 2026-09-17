import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ethOption, nativeEthView, useEthAssetField } from "./eth-option";

function setup(asset = "1", asEth = false) {
  const setValue = vi.fn();
  const watch = (name: string) => (name === "asset" ? asset : asEth);
  const { result } = renderHook(() =>
    // biome-ignore lint/suspicious/noExplicitAny: the hook's generic is satisfied by the two real form schemas, not by a bare mock
    useEthAssetField({ watch, setValue } as any),
  );
  return { setValue, result };
}

function fieldsSet(setValue: ReturnType<typeof vi.fn>) {
  return Object.fromEntries(setValue.mock.calls.map(([name, value]) => [name, value]));
}

describe("useEthAssetField", () => {
  it("keeps the id inside a native option, so a second WETH id is reachable", () => {
    const { setValue, result } = setup();
    result.current.onPickerChange(ethOption("4"));
    expect(fieldsSet(setValue)).toEqual({ asset: "4", asEth: true });
  });

  it("still resolves the plain native option to its own id", () => {
    const { setValue, result } = setup();
    result.current.onPickerChange(ethOption("1"));
    expect(fieldsSet(setValue)).toEqual({ asset: "1", asEth: true });
  });

  it("clears asEth for a plain asset id", () => {
    const { setValue, result } = setup("1", true);
    result.current.onPickerChange("4");
    expect(fieldsSet(setValue)).toEqual({ asset: "4", asEth: false });
  });

  it("renders the stored fields back as the option that set them", () => {
    expect(setup("4", true).result.current.pickerValue).toBe(ethOption("4"));
    expect(setup("4", false).result.current.pickerValue).toBe("4");
  });
});

describe("nativeEthView", () => {
  const WETH = { symbol: "WETH", token: "0x00000000000000000000000000000000000000ee" };

  it("names the native path ETH everywhere, with the coin's own mark", () => {
    expect(nativeEthView(WETH, true)).toEqual({
      symbol: "ETH",
      spendSymbol: "ETH",
      address: undefined,
    });
  });

  it("leaves the registry's name and artwork off the native path", () => {
    expect(nativeEthView(WETH, false)).toEqual({
      symbol: "WETH",
      spendSymbol: undefined,
      address: WETH.token,
    });
    expect(nativeEthView(undefined, false).symbol).toBeUndefined();
  });
});
