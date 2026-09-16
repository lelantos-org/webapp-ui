// @vitest-environment jsdom
// The deposit form validates the amount against this balance, so the
// difference between "zero" and "not known" is the difference between a
// correct rejection and a wrong one.

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { queryWrapper } from "@/test/render";

const chain = {
  nativeBalance: vi.fn(),
  tokenBalanceOf: vi.fn(),
};

// The barrel with the real module spread under the stub, so mocking one hook
// does not blank every other symbol `@/features/wallet` re-exports.
vi.mock("@/features/wallet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/wallet")>()),
  useWallet: () => fakeWalletContext({ wallet: fakeWalletApi({ chain }), ethAddress: ACCOUNT }),
}));
vi.mock("@/features/chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/chain")>()),
  ...(await import("@/test/fakes/chain")).activeChainHooks({ chainId: 1n }),
}));
vi.mock("../registry/registered-assets", () => ({
  useRegisteredAssets: () => [
    { id: 5n, token: TOKEN },
    { id: 6n, token: OTHER_TOKEN },
    // A second id over the first token, as a yield variant is.
    { id: 7n, token: TOKEN.toUpperCase().replace("0X", "0x") },
  ],
}));

const ACCOUNT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1";
const TOKEN = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1";
const OTHER_TOKEN = "0xccccccccccccccccccccccccccccccccccccccc1";

const { useDepositSourceBalance, usePublicBalances } = await import("./transparent-balances");

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
    // "More than you hold" and the deposit button stays dead until the
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

// A deposit's relayer fee may be paid from another token's public balance.
describe("usePublicBalances", () => {
  it("keys each answered balance by asset id, leaving a failed read out", async () => {
    chain.tokenBalanceOf.mockImplementation(async (token: string) => {
      if (token === TOKEN) return 1_000n;
      throw new Error("rpc rate limited");
    });

    const { result } = renderHook(() => usePublicBalances([5n, 6n]), { wrapper: queryWrapper });

    await waitFor(() => expect(result.current.get(5n)).toBe(1_000n));
    await waitFor(() => expect(chain.tokenBalanceOf).toHaveBeenCalledTimes(2));
    // Unknown, not zero: a missing entry never reads as a shortfall.
    expect(result.current.has(6n)).toBe(false);
  });

  // Each read announces the user's EOA to the RPC, so one token is read once.
  it("reads a token named by two ids once, answering both", async () => {
    chain.tokenBalanceOf.mockResolvedValue(1_000n);

    const { result } = renderHook(() => usePublicBalances([5n, 7n]), { wrapper: queryWrapper });

    await waitFor(() => expect(result.current.get(7n)).toBe(1_000n));
    expect(result.current.get(5n)).toBe(1_000n);
    expect(chain.tokenBalanceOf).toHaveBeenCalledOnce();
  });
});
