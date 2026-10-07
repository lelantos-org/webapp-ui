import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/features/wallet/testing";
import { renderAppHook } from "@/test/app";
import { feeIncoming, useAssetFeeBps, useFeePreview } from "./use-fee-preview";

/// 1%: easy to read off the figures below.
const asset = vi.fn(async () => ({
  scale: 1n,
  depositBps: 100n,
  withdrawBps: 50n,
  token: "0x0000000000000000000000000000000000000001",
  index: 10n ** 27n,
}));

const connected = { wallet: { wallet: fakeWalletApi({ asset }) } };

describe("useFeePreview", () => {
  it("follows the amount as it is typed, reading the asset's rate once", async () => {
    asset.mockClear();
    const { result, rerender } = renderAppHook(
      ({ amount }: { amount: bigint | undefined }) => useFeePreview(1n, amount, "deposit"),
      { ...connected, initialProps: { amount: 1_000n } },
    );
    expect(feeIncoming(result.current)).toBe(true);
    await waitFor(() => expect(result.current.data?.fee).toBe(10n));

    // The next keystrokes are arithmetic: no wait, no request.
    rerender({ amount: 20_000n });
    expect(result.current.data).toMatchObject({ fee: 200n, total: 20_200n });
    rerender({ amount: 5n });
    expect(result.current.data?.inAmt).toBe(5n);
    expect(asset).toHaveBeenCalledOnce();
  });

  it("has no figure for an empty or zero amount", async () => {
    const { result, rerender } = renderAppHook(
      ({ amount }: { amount: bigint | undefined }) => useFeePreview(1n, amount, "deposit"),
      { ...connected, initialProps: { amount: undefined as bigint | undefined } },
    );
    await waitFor(() => expect(asset).toHaveBeenCalled());
    expect(result.current.data).toBeUndefined();
    rerender({ amount: 0n });
    expect(result.current.data).toBeUndefined();
  });

  it("reads the rate of the leg asked for", async () => {
    const { result } = renderAppHook(() => useAssetFeeBps(1n, "withdraw"), connected);
    await waitFor(() => expect(result.current).toBe(50n));
  });
});
