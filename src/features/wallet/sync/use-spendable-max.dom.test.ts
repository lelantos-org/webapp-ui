import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { renderQueryHook } from "@/test/render";
import { useSpendableMax } from "./use-spendable-max";

const ASSET = 1n;
const TRANSFER = { kind: "transfer" } as const;

const state = vi.hoisted(() => ({
  balances: [{ asset: 1n, balance: 500n, notes: 2, pending: 0n, outflow: 0n }],
  syncedAt: 1,
}));
const spendableMax = vi.hoisted(() => vi.fn(async () => ({ max: 500n })));

vi.mock("../session/context", () => ({
  useWallet: () => fakeWalletContext({ wallet: fakeWalletApi({ address: "0xabc", spendableMax }) }),
  useWalletInstance: () => fakeWalletApi({ address: "0xabc", spendableMax }),
}));
vi.mock("./use-wallet-state", () => ({ useWalletState: () => ({ data: state }) }));
vi.mock("@/features/chain", async () =>
  (await import("@/test/fakes/chain")).activeChainHooks({ chainId: 31337n }),
);

describe("useSpendableMax", () => {
  it("does not re-read when a sync lands with nothing moved", async () => {
    const { result, rerender } = renderQueryHook(() => useSpendableMax(ASSET, TRANSFER));
    await waitFor(() => expect(result.current?.max).toBe(500n));
    const reads = spendableMax.mock.calls.length;

    state.syncedAt += 1;
    rerender();

    expect(spendableMax.mock.calls.length).toBe(reads);
    expect(result.current?.max).toBe(500n);
  });

  it("re-reads when the holdings actually move", async () => {
    const { result, rerender } = renderQueryHook(() => useSpendableMax(ASSET, TRANSFER));
    await waitFor(() => expect(result.current?.max).toBe(500n));

    spendableMax.mockResolvedValueOnce({ max: 900n });
    state.balances = [{ asset: 1n, balance: 900n, notes: 3, pending: 0n, outflow: 0n }];
    rerender();

    await waitFor(() => expect(result.current?.max).toBe(900n));
  });

  it("asks the SDK for the spend's own fee reservation", async () => {
    const { result } = renderQueryHook(() =>
      useSpendableMax(ASSET, { kind: "withdraw", feeAsset: 2n, native: true }),
    );
    await waitFor(() => expect(result.current?.max).toBeDefined());
    expect(spendableMax).toHaveBeenLastCalledWith(ASSET, {
      kind: "withdraw",
      feeAsset: 2n,
      native: true,
    });
  });

  it("holds the previous ceiling while a changed key reloads", async () => {
    const { result, rerender } = renderQueryHook(
      ({ fee }: { fee: bigint }) => useSpendableMax(ASSET, { ...TRANSFER, quotedFee: fee }),
      { initialProps: { fee: 0n } },
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
