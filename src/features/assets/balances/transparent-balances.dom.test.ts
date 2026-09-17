import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { renderQueryHook } from "@/test/render";

const chain = {
  nativeBalance: vi.fn(),
  tokenBalanceOf: vi.fn(),
};

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

    const { result } = renderQueryHook(() => useDepositSourceBalance(5n, false));

    await waitFor(() => expect(result.current).toBe(1_000n));
  });

  it("reports a failed read as unknown, not as zero", async () => {
    chain.tokenBalanceOf.mockRejectedValue(new Error("rpc rate limited"));

    const { result } = renderQueryHook(() => useDepositSourceBalance(5n, false));

    await waitFor(() => expect(chain.tokenBalanceOf).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });

  it("reports a missing adapter entrypoint as unknown", async () => {
    const { result } = renderQueryHook(() => useDepositSourceBalance(undefined, true));

    await waitFor(() => expect(result.current).toBeUndefined());
  });

  it("reads the native balance for the asEth path", async () => {
    chain.nativeBalance.mockResolvedValue(42n);

    const { result } = renderQueryHook(() => useDepositSourceBalance(5n, true));

    await waitFor(() => expect(result.current).toBe(42n));
    expect(chain.tokenBalanceOf).not.toHaveBeenCalled();
  });
});

describe("usePublicBalances", () => {
  it("keys each answered balance by asset id, leaving a failed read out", async () => {
    chain.tokenBalanceOf.mockImplementation(async (token: string) => {
      if (token === TOKEN) return 1_000n;
      throw new Error("rpc rate limited");
    });

    const { result } = renderQueryHook(() => usePublicBalances([5n, 6n]));

    await waitFor(() => expect(result.current.get(5n)).toBe(1_000n));
    await waitFor(() => expect(chain.tokenBalanceOf).toHaveBeenCalledTimes(2));
    expect(result.current.has(6n)).toBe(false);
  });

  // Each read announces the user's EOA to the RPC, so one token is read once.
  it("reads a token named by two ids once, answering both", async () => {
    chain.tokenBalanceOf.mockResolvedValue(1_000n);

    const { result } = renderQueryHook(() => usePublicBalances([5n, 7n]));

    await waitFor(() => expect(result.current.get(7n)).toBe(1_000n));
    expect(result.current.get(5n)).toBe(1_000n);
    expect(chain.tokenBalanceOf).toHaveBeenCalledOnce();
  });
});
