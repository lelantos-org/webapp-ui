// What the max query re-runs for, which is the thing that decides whether every
// figure derived from it flickers.
//
// `spendableMax` is not only a number in a field: `ladder.ts` reads an unknown
// ceiling as "no ceiling" and offers the whole ladder against it. So a key that
// churns on a timer does not merely refetch — it blanks the max, and a wallet
// too small for any rung watches a full row of denomination chips appear and
// disappear once per sync.

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { queryWrapper } from "@/test/harness";
import { useSpendableMax } from "./use-spendable-max";

const ASSET = 1n;

const state = vi.hoisted(() => ({
  balances: [{ asset: 1n, balance: 500n, notes: 2, pending: 0n, outflow: 0n }],
  /// `Date.now()` in the app, rewritten on every successful sync whether or not
  /// anything moved. That is the whole point of these tests.
  syncedAt: 1,
}));
const spendableMax = vi.hoisted(() => vi.fn(async () => ({ max: 500n })));

vi.mock("./use-wallet", () => ({
  useWallet: () => ({ wallet: { address: "0xabc", spendableMax } }),
}));
vi.mock("./use-wallet-state", () => ({ useWalletState: () => ({ data: state }) }));
vi.mock("@/features/chain", () => ({ useActiveChain: () => ({ chainId: 31337n }) }));

describe("useSpendableMax", () => {
  it("does not re-read when a sync lands with nothing moved", async () => {
    const { result, rerender } = renderHook(() => useSpendableMax(ASSET), {
      wrapper: queryWrapper,
    });
    await waitFor(() => expect(result.current?.max).toBe(500n));
    const reads = spendableMax.mock.calls.length;

    // A poll that found nothing: the balances are identical, only the stamp
    // moved. Keying on that stamp is what used to mint a fresh cache entry —
    // and a fresh entry has no data, so the max blanked and came back.
    state.syncedAt += 1;
    rerender();

    expect(spendableMax.mock.calls.length).toBe(reads);
    expect(result.current?.max).toBe(500n);
  });

  it("re-reads when the holdings actually move", async () => {
    const { result, rerender } = renderHook(() => useSpendableMax(ASSET), {
      wrapper: queryWrapper,
    });
    await waitFor(() => expect(result.current?.max).toBe(500n));

    spendableMax.mockResolvedValueOnce({ max: 900n });
    state.balances = [{ asset: 1n, balance: 900n, notes: 3, pending: 0n, outflow: 0n }];
    rerender();

    await waitFor(() => expect(result.current?.max).toBe(900n));
  });

  // The ceiling moving is not the ceiling being unknown. While the new read is
  // in flight the previous answer stands, so nothing downstream sees the
  // `undefined` that means "no ceiling at all".
  it("holds the previous ceiling while a changed key reloads", async () => {
    const { result, rerender } = renderHook(
      ({ fee }: { fee: bigint }) => useSpendableMax(ASSET, { sameAssetFee: fee }),
      { wrapper: queryWrapper, initialProps: { fee: 0n } },
    );
    await waitFor(() => expect(result.current?.max).toBe(500n));

    let release: ((v: { max: bigint }) => void) | undefined;
    spendableMax.mockImplementationOnce(() => new Promise<{ max: bigint }>((r) => (release = r)));
    rerender({ fee: 5n });

    expect(result.current?.max).toBe(500n);
    release?.({ max: 495n });
    await waitFor(() => expect(result.current?.max).toBe(495n));
  });
});
