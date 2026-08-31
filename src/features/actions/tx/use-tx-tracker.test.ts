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
const quoteFee = vi.fn();

vi.mock("./lifecycle", () => ({
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
// Mock the leaf, not the barrel: mocking `@/features/wallet` wholesale would
// also blank the other symbols the barrel re-exports, including the
// `useInvalidateWalletState` mocked just below.
vi.mock("@/features/wallet/use-wallet", () => ({
  useWallet: () => ({
    wallet: { chain: {}, balance: () => 0n, quoteFee },
  }),
}));
vi.mock("@/features/wallet/use-wallet-state", () => ({
  useInvalidateWalletState: () => invalidate,
}));

const { useTxTracker } = await import("./use-tx-tracker");

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
  // `depositBps` rides on the entry since contracts 0.5.0 — leg 2 mints the
  // B-note as a deposit, so it is the rate `sizeBNote` prices against. Omitting
  // it makes the success path throw inside `sizeBNote` and degrade to the
  // caught branch, which passes these assertions for the wrong reason.
  fetchAssetEntry.mockReset().mockResolvedValue({ scale: 1n, depositBps: 25n, withdrawBps: 30n });
  quoteFee.mockReset().mockResolvedValue({ options: [], charged: false });
});

describe("useTxTracker", () => {
  it("records the pending overlay and starts the lifecycle watch", async () => {
    const { result } = renderHook(() => useTxTracker(), { wrapper: queryWrapper });

    await result.current(swapArgs as never);

    expect(addPendingMany).toHaveBeenCalledOnce();
    expect(trackTxLifecycle).toHaveBeenCalledOnce();
  });

  it("still tracks the tx when the post-submit chain read fails", async () => {
    // A failing registry read must not reject out of `onSuccess`, which
    // react-query awaits inside its own `try`; that would flip an
    // already-broadcast swap to `error` — red stepper, "swap failed" toast,
    // `m.data` discarded so no explorer link, no pending overlay and no
    // lifecycle watch.
    fetchAssetEntry.mockRejectedValue(new Error("rpc rate limited"));
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
