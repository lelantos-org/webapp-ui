// The deposit form validates the amount against this balance, so the
// difference between "zero" and "not known" is the difference between a
// correct rejection and a wrong one.

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryWrapper } from "@/test/harness";

const chain = {
  nativeBalance: vi.fn(),
  tokenBalanceOf: vi.fn(),
};

// The leaf rather than the barrel, so mocking one hook does not blank every
// other symbol `@/features/wallet` re-exports.
vi.mock("@/features/wallet/use-wallet", () => ({
  useWallet: () => ({ wallet: { chain }, ethAddress: ACCOUNT }),
}));
vi.mock("@/features/chain/ChainProvider", () => ({
  useActiveChain: () => ({ chainId: 1n }),
}));
vi.mock("./registered-assets", () => ({
  useRegisteredAssets: () => [{ id: 5n, token: TOKEN }],
}));

const ACCOUNT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1";
const TOKEN = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1";

const { useDepositSourceBalance } = await import("./transparent-balances");

beforeEach(() => {
  chain.nativeBalance.mockReset();
  chain.tokenBalanceOf.mockReset();
});

describe("useDepositSourceBalance", () => {
  it("reports a token balance the chain answered", async () => {
    chain.tokenBalanceOf.mockResolvedValue(1_000n);

    const { result } = renderHook(() => useDepositSourceBalance(5n, false), {
      wrapper: queryWrapper,
    });

    await waitFor(() => expect(result.current).toBe(1_000n));
  });

  it("reports a failed read as unknown, not as zero", async () => {
    // Reporting `0n` asserts the user holds nothing, so every amount comes back
    // "exceeds available balance" and the deposit button stays dead until the
    // poll recovers — blaming the balance for a failure of the read.
    chain.tokenBalanceOf.mockRejectedValue(new Error("rpc rate limited"));

    const { result } = renderHook(() => useDepositSourceBalance(5n, false), {
      wrapper: queryWrapper,
    });

    await waitFor(() => expect(chain.tokenBalanceOf).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });

  it("reports a missing adapter entrypoint as unknown", async () => {
    // A zero here also hid the difference between "this chain cannot answer"
    // and "you have nothing".
    const { result } = renderHook(() => useDepositSourceBalance(undefined, true), {
      wrapper: queryWrapper,
    });

    await waitFor(() => expect(result.current).toBeUndefined());
  });

  it("reads the native balance for the asEth path", async () => {
    chain.nativeBalance.mockResolvedValue(42n);

    const { result } = renderHook(() => useDepositSourceBalance(5n, true), {
      wrapper: queryWrapper,
    });

    await waitFor(() => expect(result.current).toBe(42n));
    expect(chain.tokenBalanceOf).not.toHaveBeenCalled();
  });
});
