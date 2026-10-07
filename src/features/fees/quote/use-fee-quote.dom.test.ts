import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/features/wallet/testing";
import { renderAppHook } from "@/test/app";
import { useFeeQuote } from "./use-fee-quote";

function walletHolding(address: string, balance: bigint) {
  const quoteFee = vi.fn(async (..._args: unknown[]) => ({
    charged: true,
    options: [{ asset: { id: 1n }, amount: 5n, balance, affordable: balance >= 5n }],
  }));
  return { quoteFee, session: { wallet: fakeWalletApi({ address, quoteFee }) } };
}

describe("useFeeQuote", () => {
  it("re-quotes for another account on the same chain instead of serving the cached one", async () => {
    const rich = walletHolding("lelantos1rich", 100n);
    const poor = walletHolding("lelantos1poor", 0n);
    const { result, setApp } = renderAppHook(() => useFeeQuote("transfer"), {
      wallet: rich.session,
    });
    await waitFor(() => expect(result.current.data?.options[0]?.affordable).toBe(true));

    setApp({ wallet: poor.session });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(poor.quoteFee).toHaveBeenCalledOnce();
    expect(result.current.data?.options[0]?.balance).toBe(0n);
    expect(result.current.data?.options[0]?.affordable).toBe(false);
  });

  it("quotes a native withdrawal at its own fee, apart from the wrapped one", async () => {
    const wallet = walletHolding("lelantos1native", 100n);

    const wrapped = renderAppHook(() => useFeeQuote("withdraw"), { wallet: wallet.session });
    await waitFor(() => expect(wrapped.result.current.data).toBeDefined());
    const native = renderAppHook(() => useFeeQuote("withdraw", true), { wallet: wallet.session });
    await waitFor(() => expect(native.result.current.data).toBeDefined());

    expect(wallet.quoteFee.mock.calls).toEqual([
      ["withdraw", { native: false }],
      ["withdraw", { native: true }],
    ]);
  });
});
