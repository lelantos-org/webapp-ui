// Regression tests for the identity a built wallet is keyed by.
//
// The shielded wallet is derived from the EOA, so "is this build still
// current?" has to compare the account as well as the chain. Keying on the
// chain alone let a stale `WalletApi` stay visible — and reported `ready` —
// across an account switch and across a disconnect that had already disposed
// its workers.

import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "@/config/chains";
import type { Connection } from "@/features/wallet/use-connection";
import { deferred } from "@/test/harness";

const buildWallet = vi.fn();

vi.mock("@/features/wallet/buildWallet", () => ({
  buildWallet: (...args: unknown[]) => buildWallet(...args),
}));
vi.mock("@/features/chain/ChainProvider", () => ({
  useActiveChainOrUndefined: () => chain,
}));
vi.mock("@/features/relayer/deposit-stream", () => ({
  closeDepositStreamsExcept: vi.fn(),
}));
vi.mock("@/features/wallet/nsk-session-cache", () => ({
  getCachedNsk: () => undefined,
}));
vi.mock("@/features/wallet/scanner", () => ({
  releaseScanner: (...args: unknown[]) => releaseScanner(...args),
}));
vi.mock("@/features/wallet/sync-progress-store", () => ({
  syncProgress: { reset: vi.fn(), finished: vi.fn(), scanning: vi.fn() },
}));

const releaseScanner = vi.fn();

const chain = { chainId: 1n, chainName: "test" } as ChainEntry;

const { useBuildWallet } = await import("@/features/wallet/use-build-wallet");

const walletFor = (address: string) => ({ address: `shielded:${address}` }) as unknown as WalletApi;

const connection = (address: string, over: Partial<Connection> = {}): Connection =>
  ({
    address: address as `0x${string}`,
    isConnected: true,
    isConnecting: false,
    chainSupported: true,
    bundle: { provider: {}, address, chain: { id: 1, name: "test" } },
    connect: () => {},
    disconnect: () => {},
    switchChain: () => {},
    ...over,
  }) as Connection;

beforeEach(() => {
  buildWallet.mockReset();
  releaseScanner.mockReset();
});

describe("useBuildWallet", () => {
  it("stops serving the previous account's wallet while the next one is being built", async () => {
    const addrA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1";
    const addrB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1";
    const walletA = walletFor(addrA);
    // B's build never settles: it is blocked on an EIP-712 prompt the user has
    // not answered. That window is exactly when the stale wallet used to show.
    const pendingB = deferred<WalletApi>();
    buildWallet.mockImplementation((bundle: { address: string }) =>
      bundle.address === addrA ? Promise.resolve(walletA) : pendingB.promise,
    );

    const { result, rerender } = renderHook((conn: Connection) => useBuildWallet(conn), {
      initialProps: connection(addrA),
    });

    await waitFor(() => expect(result.current.wallet).toBe(walletA));

    await act(async () => {
      rerender(connection(addrB));
    });

    expect(result.current.wallet).toBeUndefined();
  });

  it("drops the built wallet when the connection goes away", async () => {
    const addr = "0xccccccccccccccccccccccccccccccccccccccc1";
    const wallet = walletFor(addr);
    buildWallet.mockResolvedValue(wallet);

    const { result, rerender } = renderHook((conn: Connection) => useBuildWallet(conn), {
      initialProps: connection(addr),
    });
    await waitFor(() => expect(result.current.wallet).toBe(wallet));

    await act(async () => {
      rerender(connection(addr, { isConnected: false, bundle: undefined }));
    });
    expect(result.current.wallet).toBeUndefined();

    // Reconnecting must not unmask the old value: `disconnect` already disposed
    // its scanner pool and prover, so it is dead, not merely stale. A build that
    // has not resolved yet leaves `wallet` undefined rather than `ready`.
    const pending = deferred<WalletApi>();
    buildWallet.mockReturnValue(pending.promise);
    await act(async () => {
      rerender(connection(addr));
    });
    expect(result.current.wallet).toBeUndefined();
  });
});

describe("build ownership", () => {
  it("releases a build that no consumer adopted", async () => {
    // The wallet holds scanner workers, each with its own jubjub wasm instance,
    // and nothing but `releaseScanner` frees them — so a build whose consumer
    // has gone away must be disposed rather than dropped.
    const addr = "0xdddddddddddddddddddddddddddddddddddddd01";
    const build = deferred<WalletApi>();
    buildWallet.mockReturnValue(build.promise);

    const { unmount } = renderHook((conn: Connection) => useBuildWallet(conn), {
      initialProps: connection(addr),
    });
    unmount();

    await act(async () => {
      build.resolve(walletFor(addr));
    });

    expect(releaseScanner).toHaveBeenCalledOnce();
  });

  it("keeps the build StrictMode's second pass adopts", async () => {
    // StrictMode mounts, tears down and remounts within one root, so both
    // passes await the *same* deduped build. Releasing on "my effect was
    // aborted" alone disposes the wallet the surviving pass is about to use —
    // the app would then report `ready` against dead scanner workers.
    const addr = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee01";
    const wallet = walletFor(addr);
    buildWallet.mockResolvedValue(wallet);

    const { result } = renderHook((conn: Connection) => useBuildWallet(conn), {
      initialProps: connection(addr),
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });

    await waitFor(() => expect(result.current.wallet).toBe(wallet));
    // Built once despite the double invoke — a second build would mean a second
    // EIP-712 prompt, because the second `getCachedNsk` check beats the first
    // `cacheNsk` write.
    expect(buildWallet).toHaveBeenCalledOnce();
    expect(releaseScanner).not.toHaveBeenCalled();
  });
});
