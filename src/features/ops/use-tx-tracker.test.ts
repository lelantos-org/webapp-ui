// @vitest-environment jsdom
// The tracker runs from a mutation's `onSuccess`, after the tx is already on
// its way. Nothing it does can un-broadcast the transaction, so nothing it does
// may report the transaction as failed.

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { queryWrapper } from "@/test/render";

const addPendingMany = vi.fn();
const clearPending = vi.fn();
const trackTxLifecycle = vi.fn();
const invalidate = vi.fn();
const state = vi.fn();

vi.mock("@/features/tx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/tx")>()),
  trackTxLifecycle: (...a: unknown[]) => trackTxLifecycle(...a),
  addPendingMany: (...a: unknown[]) => addPendingMany(...a),
  clearPending: (...a: unknown[]) => clearPending(...a),
}));
vi.mock("@/features/chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/chain")>()),
  ...(await import("@/test/fakes/chain")).activeChainHooks({ chainId: 1n }),
}));
// The real barrel spread under the stubs: mocking `@/features/wallet` wholesale
// would also blank the other symbols it re-exports.
vi.mock("@/features/wallet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/wallet")>()),
  useWallet: () => fakeWalletContext({ wallet: fakeWalletApi({ chain: {}, state }) }),
  useWalletInstance: () => fakeWalletApi({ chain: {}, state }),
  useInvalidateWalletState: () => invalidate,
}));

const { useTxTracker } = await import("./use-tx-tracker");

const swapArgs = {
  label: "swap",
  kind: "swap" as const,
  result: {
    kind: "swap",
    txHash: "0xdead",
    asset: { id: 1n },
    commitments: ["0xcm0", "0xcm1"],
    ownCommitments: [],
    change: 0n,
    gross: { amount: 5n },
  },
  swap: { quote: { assetOut: { id: 2n }, credit: { amount: 10n } } },
};

beforeEach(() => {
  invalidate.mockResolvedValue(undefined);
  state.mockReturnValue({ balances: new Map([[2n, 7n]]) });
});

describe("useTxTracker", () => {
  it("records the pending overlay and starts the lifecycle watch", async () => {
    const { result } = renderHook(() => useTxTracker(), { wrapper: queryWrapper });

    await result.current(swapArgs as never);

    expect(addPendingMany).toHaveBeenCalledOnce();
    expect(trackTxLifecycle).toHaveBeenCalledOnce();
  });

  it("keys the overlay by operation and settles only that operation", async () => {
    const { result } = renderHook(() => useTxTracker(), { wrapper: queryWrapper });

    await result.current(swapArgs as never);

    // A bundled tx can carry two of this wallet's operations, so the hash alone
    // would clear both overlays when the first settles.
    expect(addPendingMany).toHaveBeenCalledWith(
      1n,
      { txHash: "0xdead", opId: "0xcm0" },
      expect.anything(),
    );
    trackTxLifecycle.mock.calls[0]?.[0].onSettled();
    expect(clearPending).toHaveBeenCalledWith(1n, "0xcm0");
  });

  it("watermarks the leg-B note at the quote's credit over the confirmed baseline", async () => {
    const { result } = renderHook(() => useTxTracker(), { wrapper: queryWrapper });

    await result.current(swapArgs as never);

    expect(addPendingMany).toHaveBeenLastCalledWith(1n, expect.anything(), [
      { asset: 1n, pendingIn: 0n, outflow: 5n },
      { asset: 2n, pendingIn: 10n, outflow: 0n, clearWhenBalanceAtLeast: 17n },
    ]);
  });

  it("still tracks the tx when the baseline read fails", async () => {
    // A throwing read must not reject out of `onSuccess`, which react-query
    // awaits inside its own `try`; that would flip an already-broadcast swap to
    // `error` — red stepper, "swap failed" toast, `m.data` discarded so no
    // explorer link, no pending overlay and no lifecycle watch.
    state.mockImplementation(() => {
      throw new Error("disposed");
    });
    const { result } = renderHook(() => useTxTracker(), { wrapper: queryWrapper });

    await expect(result.current(swapArgs as never)).resolves.toBeUndefined();

    expect(addPendingMany).toHaveBeenCalledOnce();
    expect(trackTxLifecycle).toHaveBeenCalledOnce();
  });

  it("still tracks the tx when the post-submit refetch fails", async () => {
    invalidate.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useTxTracker(), { wrapper: queryWrapper });

    await expect(result.current(swapArgs as never)).resolves.toBeUndefined();

    expect(trackTxLifecycle).toHaveBeenCalledOnce();
  });

  it("hands a deposit's escrow to the lifecycle", async () => {
    const escrow = { commitment: "0xc0" };
    const { result } = renderHook(() => useTxTracker(), { wrapper: queryWrapper });

    await result.current({
      label: "deposit",
      kind: "deposit",
      result: {
        kind: "deposit",
        txHash: "0xbeef",
        asset: { id: 1n },
        amount: { amount: 5n },
        commitments: ["0xc0"],
        ownCommitments: ["0xc0"],
        escrow,
      },
    } as never);

    expect(trackTxLifecycle.mock.lastCall?.[0]).toMatchObject({ escrow, txHash: "0xbeef" });
  });
});
