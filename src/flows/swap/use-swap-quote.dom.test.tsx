import { circuitAmount, type QuoteSwapOptions } from "@lelantos-org/sdk";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderQueryHook } from "@/test/render";
import { useSwapQuote } from "./use-swap-quote";

const quoteSwap = vi.hoisted(() => vi.fn());

vi.mock("@/features/wallet", () => ({
  useWalletInstance: () => ({ address: "lelantos1me", quoteSwap }),
}));
vi.mock("@/features/chain", async () =>
  (await import("@/test/fakes/chain")).activeChainHooks({ chainId: 31337n }),
);

function request(gross: bigint): QuoteSwapOptions {
  return { assetIn: 1n, assetOut: 2n, gross: circuitAmount(gross), slippageBps: 50 };
}

describe("useSwapQuote", () => {
  beforeEach(() => {
    quoteSwap.mockImplementation(async () => ({ venue: "test", minOut: 1n, expectedOut: 2n }));
  });

  it("settles on a request the caller rebuilds every render", async () => {
    const { result, rerender } = renderQueryHook(() => useSwapQuote(request(1_000n)));
    rerender();
    rerender();

    await waitFor(() => expect(result.current.stale).toBe(false));
    await waitFor(() => expect(result.current.data).toBeDefined());

    rerender();
    expect(result.current.stale).toBe(false);
    expect(quoteSwap).toHaveBeenCalledTimes(1);
  });

  it("goes stale the moment the request changes, before the new quote lands", async () => {
    let amount = 1_000n;
    const { result, rerender } = renderQueryHook(() => useSwapQuote(request(amount)));
    await waitFor(() => expect(result.current.data).toBeDefined());

    amount = 2_000n;
    rerender();

    expect(result.current.stale).toBe(true);
  });

  it("does not quote an incomplete request", () => {
    const { result } = renderQueryHook(() => useSwapQuote(undefined));

    expect(result.current.data).toBeUndefined();
    expect(quoteSwap).not.toHaveBeenCalled();
  });
});
