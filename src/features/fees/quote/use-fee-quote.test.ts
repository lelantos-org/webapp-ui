// @vitest-environment jsdom
// The relayer quote is per account, not only per chain.
//
// Each option carries the wallet's balance in the asset and whether it covers
// the charge. Keyed on the chain alone, switching to a second account on the
// same chain served the first account's balances — and its `affordable` verdict
// — from cache until the quote went stale.

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { queryWrapper } from "@/test/render";
import { useFeeQuote } from "./use-fee-quote";

const session = vi.hoisted(() => ({
  wallet: undefined as { address: string; quoteFee: () => Promise<unknown> } | undefined,
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
    quoteFee: vi.fn(async () => ({
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

    const { result, rerender } = renderHook(() => useFeeQuote("transfer"), {
      wrapper: queryWrapper,
    });
    await waitFor(() => expect(result.current.data?.options[0]?.affordable).toBe(true));

    session.wallet = poor;
    rerender();

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(poor.quoteFee).toHaveBeenCalledOnce();
    expect(result.current.data?.options[0]?.balance).toBe(0n);
    expect(result.current.data?.options[0]?.affordable).toBe(false);
  });
});
