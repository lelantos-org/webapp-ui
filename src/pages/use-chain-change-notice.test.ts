import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChainChangeNotice } from "./use-chain-change-notice";

const ANVIL = { key: "31337", name: "Anvil" };
const SEPOLIA = { key: "11155111", name: "Sepolia" };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useChainChangeNotice", () => {
  it("says nothing on first mount", () => {
    // Arriving somewhere is not a change. Reporting one here would put a
    // "network changed" notice on screen on every cold load.
    const { result } = renderHook(() => useChainChangeNotice(ANVIL));

    expect(result.current).toBeUndefined();
  });

  it("says nothing while the chain resolves from undefined", () => {
    const { result, rerender } = renderHook(({ c }) => useChainChangeNotice(c), {
      initialProps: { c: undefined as { key: string; name: string } | undefined },
    });

    rerender({ c: ANVIL });

    expect(result.current).toBeUndefined();
  });

  it("names the chain that was left after a switch", () => {
    const { result, rerender } = renderHook(({ c }) => useChainChangeNotice(c), {
      initialProps: { c: ANVIL },
    });

    rerender({ c: SEPOLIA });

    expect(result.current).toBe("Anvil");
  });

  it("says nothing when the same chain re-renders", () => {
    const { result, rerender } = renderHook(({ c }) => useChainChangeNotice(c), {
      initialProps: { c: ANVIL },
    });

    rerender({ c: { ...ANVIL } });

    expect(result.current).toBeUndefined();
  });

  it("clears itself after the notice window", () => {
    const { result, rerender } = renderHook(({ c }) => useChainChangeNotice(c), {
      initialProps: { c: ANVIL },
    });
    rerender({ c: SEPOLIA });
    expect(result.current).toBe("Anvil");

    act(() => void vi.advanceTimersByTime(8000));

    expect(result.current).toBeUndefined();
  });

  it("reports the most recent hop when switches come back to back", () => {
    const { result, rerender } = renderHook(({ c }) => useChainChangeNotice(c), {
      initialProps: { c: ANVIL },
    });

    rerender({ c: SEPOLIA });
    rerender({ c: ANVIL });

    expect(result.current).toBe("Sepolia");
  });
});
