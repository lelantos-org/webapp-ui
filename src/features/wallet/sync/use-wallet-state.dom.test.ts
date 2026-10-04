import { useQuery } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/shared/query/keys";
import { deferred } from "@/test/async";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { createTestQueryClient, withQueryClient } from "@/test/render";
import { useInvalidateWalletState, useWalletState } from "./use-wallet-state";

const CHAIN = 31337n;
const ADDRESS = "lelantos1me";

const chainHead = vi.hoisted(() => ({ value: null as string | null }));
const wallet = vi.hoisted(() => ({
  address: "lelantos1me",
  sync: vi.fn(async () => {}),
  notes: vi.fn(async () => []),
}));

vi.mock("../session/context", () => ({
  useWallet: () => fakeWalletContext({ wallet: fakeWalletApi(wallet) }),
  useWalletInstance: () => fakeWalletApi(wallet),
}));
vi.mock("./use-sync-head", () => ({ useSyncHead: () => chainHead.value }));
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

    await waitFor(() => expect(syncNotes).toHaveBeenCalledTimes(2));
    expect(quoteFee).toHaveBeenCalledOnce();

    next.resolve({ balances: [], syncedAt: 2 });
    await done;
    await waitFor(() => expect(quoteFee).toHaveBeenCalledTimes(2));
    expect(otherAccount).toHaveBeenCalledOnce();
  });
});

describe("useWalletState on a new chain head", () => {
  it("syncs once per head however many callers are mounted", async () => {
    chainHead.value = "10:3";
    wallet.sync.mockClear();
    const { rerender } = renderHook(
      () => {
        useWalletState();
        useWalletState();
        useWalletState();
      },
      { wrapper: withQueryClient(createTestQueryClient()) },
    );
    await waitFor(() => expect(wallet.sync).toHaveBeenCalledTimes(1));

    chainHead.value = "11:3";
    rerender();
    await waitFor(() => expect(wallet.sync).toHaveBeenCalledTimes(2));

    // Nothing further is queued behind that one sync.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(wallet.sync).toHaveBeenCalledTimes(2);
  });
});
