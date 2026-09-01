import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ethOption } from "./eth-option";
import { useEthAssetPicker } from "./use-eth-asset-picker";

function setup(asset = "1", asEth = false) {
  const setValue = vi.fn();
  const { result } = renderHook(() =>
    // biome-ignore lint/suspicious/noExplicitAny: the hook's generic is satisfied by the two real form schemas, not by a bare mock
    useEthAssetPicker(setValue as any, asset, asEth),
  );
  return { setValue, result };
}

function fieldsSet(setValue: ReturnType<typeof vi.fn>) {
  return Object.fromEntries(setValue.mock.calls.map(([name, value]) => [name, value]));
}

describe("useEthAssetPicker", () => {
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

  // A yield asset picked as an ERC-20 goes down the Permit2 path, not the
  // adapter's — `asEth` has to come back off.
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
