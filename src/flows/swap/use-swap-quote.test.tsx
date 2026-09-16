// @vitest-environment jsdom

import { circuitAmount, type QuoteSwapOptions } from "@lelantos-org/sdk";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryWrapper } from "@/test/render";
import { useSwapQuote } from "./use-swap-quote";

const quoteSwap = vi.hoisted(() => vi.fn());

vi.mock("@/features/wallet", () => ({
  useWalletInstance: () => ({ address: "lelantos1me", quoteSwap }),
}));
vi.mock("@/features/chain", async () =>
  (await import("@/test/fakes/chain")).activeChainHooks({ chainId: 31337n }),
);

/// A fresh object every call, as the form builds it — the identity trap this
/// hook has to absorb.
function request(gross: bigint): QuoteSwapOptions {
  return { assetIn: 1n, assetOut: 2n, gross: circuitAmount(gross), slippageBps: 50 };
}

describe("useSwapQuote", () => {
  beforeEach(() => {
    quoteSwap.mockImplementation(async () => ({ venue: "test", minOut: 1n, expectedOut: 2n }));
  });

  it("settles on a request the caller rebuilds every render", async () => {
    // The regression this pins: `useDebouncedValue` keys on identity, so fed
    // the raw object it restarts its timer every render — and the state it
    // then sets causes the next render. The value never settles, the component
    // re-renders on a 300ms loop, and each pass buys another quote.
    const { result, rerender } = renderHook(() => useSwapQuote(request(1_000n)), {
      wrapper: queryWrapper,
    });
    rerender();
    rerender();

    await waitFor(() => expect(result.current.stale).toBe(false));
    await waitFor(() => expect(result.current.data).toBeDefined());

    rerender();
    expect(result.current.stale).toBe(false);
    expect(quoteSwap).toHaveBeenCalledTimes(1);
  });

  it("goes stale the moment the request changes, before the new quote lands", async () => {
    // A quote binds a route into the proof. Between a keystroke and the fetch
    // settling, `data` still describes the previous amount, and the form must
    // treat it as absent rather than submit it.
    let amount = 1_000n;
    const { result, rerender } = renderHook(() => useSwapQuote(request(amount)), {
      wrapper: queryWrapper,
    });
    await waitFor(() => expect(result.current.data).toBeDefined());

    amount = 2_000n;
    rerender();

    expect(result.current.stale).toBe(true);
  });

  it("does not quote an incomplete request", () => {
    const { result } = renderHook(() => useSwapQuote(undefined), { wrapper: queryWrapper });

    expect(result.current.data).toBeUndefined();
    expect(quoteSwap).not.toHaveBeenCalled();
  });
});
