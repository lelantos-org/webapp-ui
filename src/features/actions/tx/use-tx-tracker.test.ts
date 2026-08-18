// The tracker runs from a mutation's `onSuccess`, after the tx is already on
// its way. Nothing it does can un-broadcast the transaction, so nothing it does
// may report the transaction as failed.

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryWrapper } from "@/test/harness";

const addPendingMany = vi.fn();
const trackTxLifecycle = vi.fn();
const invalidate = vi.fn();
const fetchAssetEntry = vi.fn();
const fetchFeeBps = vi.fn();

vi.mock("@/features/actions/tx/lifecycle", () => ({
  trackTxLifecycle: (...a: unknown[]) => trackTxLifecycle(...a),
}));
vi.mock("@/features/pending-tx/store", () => ({
  addPendingMany: (...a: unknown[]) => addPendingMany(...a),
  clearPending: vi.fn(),
}));
vi.mock("@/features/assets/asset-entry", () => ({
  fetchAssetEntry: (...a: unknown[]) => fetchAssetEntry(...a),
}));
vi.mock("@/features/chain/ChainProvider", () => ({
  useActiveChain: () => ({ chainId: 1n, explorerUrl: undefined }),
}));
vi.mock("@/features/wallet", () => ({
  useWallet: () => ({
    wallet: { chain: { fetchFeeBps }, balance: () => 0n },
  }),
}));
vi.mock("@/features/wallet/use-wallet-state", () => ({
  useInvalidateWalletState: () => invalidate,
}));

const { useTxTracker } = await import("@/features/actions/tx/use-tx-tracker");

const swapArgs = {
  label: "swap",
  kind: "swap" as const,
  result: { kind: "swap", txHash: "0xdead", ownCommitments: [], depositId: 1n },
  swap: { assetIn: 1n, assetOut: 2n, amount: 5n, quote: { minOut: 10n } },
};

beforeEach(() => {
  addPendingMany.mockReset();
  trackTxLifecycle.mockReset();
  invalidate.mockReset().mockResolvedValue(undefined);
  fetchAssetEntry.mockReset().mockResolvedValue({ scale: 1n });
  fetchFeeBps.mockReset().mockResolvedValue(25n);
});

describe("useTxTracker", () => {
  it("records the pending overlay and starts the lifecycle watch", async () => {
    const { result } = renderHook(() => useTxTracker(), { wrapper: queryWrapper });

    await result.current(swapArgs as never);

    expect(addPendingMany).toHaveBeenCalledOnce();
    expect(trackTxLifecycle).toHaveBeenCalledOnce();
  });

  it("still tracks the tx when the post-submit chain read fails", async () => {
    // `fetchFeeBps` blipping used to reject out of `onSuccess`, which
    // react-query awaits inside its own `try` — flipping an already-broadcast
    // swap to `error`: red stepper, "swap failed" toast, `m.data` discarded so
    // no explorer link, no pending overlay, and no lifecycle watch at all.
    fetchFeeBps.mockRejectedValue(new Error("rpc rate limited"));
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
});
