// @vitest-environment jsdom
// What a post-spend invalidation refreshes.
//
// The relayer quote carries this wallet's balance in each asset it accepts, so a
// spend that changes the balance changes the quote's `affordable` verdict too.
// Refreshing only the wallet state left the fee picker judging the next spend
// against the balance before the last one, for up to the quote's `staleTime`.

import { useQuery } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/shared/query/keys";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { deferred } from "@/test/harness";
import { createTestQueryClient, withQueryClient } from "@/test/render";
import { useInvalidateWalletState } from "./use-wallet-state";

const CHAIN = 31337n;
const ADDRESS = "lelantos1me";

vi.mock("../session/context", () => ({
  useWallet: () => fakeWalletContext({ wallet: fakeWalletApi({ address: ADDRESS }) }),
  useWalletInstance: () => fakeWalletApi({ address: ADDRESS }),
}));
vi.mock("@/features/chain", () => ({ useActiveChain: () => ({ chainId: CHAIN }) }));

describe("useInvalidateWalletState", () => {
  it("re-quotes this account's relayer fee once the sync has landed", async () => {
    const client = createTestQueryClient();
    const sync = deferred<{ balances: []; syncedAt: number }>();
    const syncNotes = vi.fn(() => sync.promise);
    const quoteFee = vi.fn(async () => ({ charged: false, options: [] }));
    const otherAccount = vi.fn(async () => ({ charged: false, options: [] }));

    const { result } = renderHook(
      () => {
        useQuery({
          queryKey: queryKeys.walletState(CHAIN, ADDRESS),
          queryFn: syncNotes,
          staleTime: Number.POSITIVE_INFINITY,
        });
        useQuery({
          queryKey: queryKeys.feeQuote(CHAIN, ADDRESS, "transfer"),
          queryFn: quoteFee,
          staleTime: Number.POSITIVE_INFINITY,
        });
        useQuery({
          queryKey: queryKeys.feeQuote(CHAIN, "lelantos1else", "transfer"),
          queryFn: otherAccount,
          staleTime: Number.POSITIVE_INFINITY,
        });
        return useInvalidateWalletState();
      },
      { wrapper: withQueryClient(client) },
    );
    sync.resolve({ balances: [], syncedAt: 1 });
    await waitFor(() => expect(quoteFee).toHaveBeenCalledOnce());

    const next = deferred<{ balances: []; syncedAt: number }>();
    syncNotes.mockImplementationOnce(() => next.promise);
    const done = result.current();

    // Not while the notes it reads are still being replaced.
    await waitFor(() => expect(syncNotes).toHaveBeenCalledTimes(2));
    expect(quoteFee).toHaveBeenCalledOnce();

    next.resolve({ balances: [], syncedAt: 2 });
    await done;
    await waitFor(() => expect(quoteFee).toHaveBeenCalledTimes(2));
    expect(otherAccount).toHaveBeenCalledOnce();
  });
});
