import { circuitAmount, type QuoteSwapOptions } from "@lelantos-org/sdk";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/features/wallet/testing";
import { renderAppHook } from "@/test/app";
import { useSwapQuote } from "./use-swap-quote";

const quoteSwap = vi.fn();
const connected = { wallet: { wallet: fakeWalletApi({ address: "lelantos1me", quoteSwap }) } };

function request(gross: bigint): QuoteSwapOptions {
  return { assetIn: 1n, assetOut: 2n, gross: circuitAmount(gross), slippageBps: 50 };
}

describe("useSwapQuote", () => {
  beforeEach(() => {
    quoteSwap.mockImplementation(async () => ({ venue: "test", minOut: 1n, expectedOut: 2n }));
  });

  it("settles on a request the caller rebuilds every render", async () => {
    const { result, rerender } = renderAppHook(() => useSwapQuote(request(1_000n)), connected);
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
    const { result, rerender } = renderAppHook(() => useSwapQuote(request(amount)), connected);
    await waitFor(() => expect(result.current.data).toBeDefined());

    amount = 2_000n;
    rerender();

    expect(result.current.stale).toBe(true);
  });

  it("does not quote an incomplete request", () => {
    const { result } = renderAppHook(() => useSwapQuote(undefined), connected);

    expect(result.current.data).toBeUndefined();
    expect(quoteSwap).not.toHaveBeenCalled();
  });
});
