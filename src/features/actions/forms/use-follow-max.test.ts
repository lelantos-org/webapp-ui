import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AssetMeta } from "./amount-field";
import { useFollowMax } from "./use-follow-max";

// 0 decimals and unit scale so the formatted figure is the number passed in.
const META: AssetMeta = { symbol: "WETH", decimals: 0, scale: 1n };

/// Drive the hook the way a form does: render, click max, then re-render with
/// the field holding whatever was written.
function harness(initialMax: bigint | undefined) {
  let current = "";
  // The real `setAmount` writes into the form, and `watch("amount")` reflects
  // it on the next render — so the field follows what the hook wrote.
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
    // The reported failure: max at 4 input slots, then the fee asset switches
    // to a cross-asset one and the ceiling falls to the 3-slot sum.
    const h = harness(100n);
    h.clickMax("100");
    h.setAmount.mockClear();

    h.view.rerender({ max: 90n });
    expect(h.setAmount).toHaveBeenCalledWith("90");
  });

  it("leaves an amount the user typed alone", () => {
    // Now too large, but validation reports it; a typed value is not rewritten.
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
    // A reload leaves the query pending; blanking the field would look like
    // the app had thrown the amount away.
    const h = harness(100n);
    h.clickMax("100");
    h.setAmount.mockClear();

    h.view.rerender({ max: undefined });
    expect(h.setAmount).not.toHaveBeenCalled();
  });

  it("follows a ceiling that rises again", () => {
    // Switching back to a same-asset fee regains the input slot.
    const h = harness(100n);
    h.clickMax("100");
    h.view.rerender({ max: 90n });
    h.setAmount.mockClear();

    h.view.rerender({ max: 100n });
    expect(h.setAmount).toHaveBeenCalledWith("100");
  });
});
