import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { renderQueryHook } from "@/test/render";
import { useFeeQuote } from "./use-fee-quote";

const session = vi.hoisted(() => ({
  wallet: undefined as
    | { address: string; quoteFee: (...args: unknown[]) => Promise<unknown> }
    | undefined,
}));

vi.mock("@/features/wallet", () => ({
  useWallet: () => fakeWalletContext({ wallet: session.wallet && fakeWalletApi(session.wallet) }),
  useWalletInstance: () => session.wallet && fakeWalletApi(session.wallet),
}));
vi.mock("@/features/chain", async () =>
  (await import("@/test/fakes/chain")).activeChainHooks({ chainId: 31337n }),
);

function walletHolding(address: string, balance: bigint) {
  return {
    address,
    quoteFee: vi.fn(async (..._args: unknown[]) => ({
      charged: true,
      options: [{ asset: { id: 1n }, amount: 5n, balance, affordable: balance >= 5n }],
    })),
  };
}

describe("useFeeQuote", () => {
  it("re-quotes for another account on the same chain instead of serving the cached one", async () => {
    const rich = walletHolding("lelantos1rich", 100n);
    const poor = walletHolding("lelantos1poor", 0n);
    session.wallet = rich;

    const { result, rerender } = renderQueryHook(() => useFeeQuote("transfer"));
    await waitFor(() => expect(result.current.data?.options[0]?.affordable).toBe(true));

    session.wallet = poor;
    rerender();

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(poor.quoteFee).toHaveBeenCalledOnce();
    expect(result.current.data?.options[0]?.balance).toBe(0n);
    expect(result.current.data?.options[0]?.affordable).toBe(false);
  });

  it("quotes a native withdrawal at its own fee, apart from the wrapped one", async () => {
    const wallet = walletHolding("lelantos1native", 100n);
    session.wallet = wallet;

    const wrapped = renderQueryHook(() => useFeeQuote("withdraw"));
    await waitFor(() => expect(wrapped.result.current.data).toBeDefined());
    const native = renderQueryHook(() => useFeeQuote("withdraw", true));
    await waitFor(() => expect(native.result.current.data).toBeDefined());

    expect(wallet.quoteFee.mock.calls).toEqual([
      ["withdraw", { native: false }],
      ["withdraw", { native: true }],
    ]);
  });
});
