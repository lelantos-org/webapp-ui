import { RAY } from "@lelantos-org/sdk/protocol";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AssetMeta } from "./amount-validation";
import { useFollowMax } from "./use-follow-max";

const META: AssetMeta = { symbol: "WETH", decimals: 0, scale: 1n, index: RAY };

function harness(initialMax: bigint | undefined) {
  let current = "";
  const setAmount = vi.fn<(formatted: string) => void>((formatted) => {
    current = formatted;
  });
  const view = renderHook(
    ({ max }: { max: bigint | undefined }) => useFollowMax(max, META, current, setAmount),
    { initialProps: { max: initialMax } },
  );
  const clickMax = (formatted: string) => {
    view.result.current.onSetMax(formatted);
    current = formatted;
  };
  const setField = (text: string) => {
    current = text;
  };
  return { setAmount, view, clickMax, setField };
}

describe("useFollowMax", () => {
  it("rewrites its own figure when the ceiling drops", () => {
    const h = harness(100n);
    h.clickMax("100");
    h.setAmount.mockClear();

    h.view.rerender({ max: 90n });
    expect(h.setAmount).toHaveBeenCalledWith("90");
  });

  it("leaves an amount the user typed alone", () => {
    const h = harness(100n);
    h.clickMax("100");
    h.setField("57");
    h.setAmount.mockClear();

    h.view.rerender({ max: 90n });
    expect(h.setAmount).not.toHaveBeenCalled();
  });

  it("does nothing before the max button is used", () => {
    const h = harness(100n);
    h.view.rerender({ max: 90n });
    expect(h.setAmount).not.toHaveBeenCalled();
  });

  it("does not rewrite when the ceiling is unchanged", () => {
    const h = harness(100n);
    h.clickMax("100");
    h.setAmount.mockClear();

    h.view.rerender({ max: 100n });
    expect(h.setAmount).not.toHaveBeenCalled();
  });

  it("holds its figure while the ceiling is unknown", () => {
    const h = harness(100n);
    h.clickMax("100");
    h.setAmount.mockClear();

    h.view.rerender({ max: undefined });
    expect(h.setAmount).not.toHaveBeenCalled();
  });

  it("follows a ceiling that rises again", () => {
    const h = harness(100n);
    h.clickMax("100");
    h.view.rerender({ max: 90n });
    h.setAmount.mockClear();

    h.view.rerender({ max: 100n });
    expect(h.setAmount).toHaveBeenCalledWith("100");
  });
});
