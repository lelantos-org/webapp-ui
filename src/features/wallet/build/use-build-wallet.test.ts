// @vitest-environment jsdom
// Regression tests for the identity a built wallet is keyed by.
//
// The shielded wallet is derived from the account — the EOA for an injected
// wallet, the credential for a passkey — so "is this build still current?" has
// to compare the account as well as the chain. Keying on the chain alone let a
// stale `WalletApi` stay visible — and reported `ready` — across an account
// switch and across a disconnect that had already disposed its workers.

import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { makeChain } from "@/test/fixtures/chains";
import { deferred } from "@/test/harness";
import type { Session } from "../session/session";

const buildWallet = vi.fn();

vi.mock("./build-wallet", () => ({
  buildWallet: (...args: unknown[]) => buildWallet(...args),
}));
vi.mock("@/features/chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/chain")>()),
  useActiveChainOrUndefined: () => chain,
}));
vi.mock("@/features/tx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/tx")>()),
  closeDepositStreamsExcept: vi.fn(),
}));
vi.mock("@/features/wallet-kinds", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/wallet-kinds")>()),
  getCachedNsk: () => undefined,
}));
vi.mock("../sync/scanner", () => ({
  releaseScanner: (...args: unknown[]) => releaseScanner(...args),
}));
vi.mock("../sync/sync-progress-store", () => ({
  syncProgress: { reset: vi.fn(), finished: vi.fn(), scanning: vi.fn() },
}));

const releaseScanner = vi.fn();

const chain = makeChain({ chainId: 1n, chainName: "test" });

const { useBuildWallet } = await import("./use-build-wallet");

const walletFor = (address: string) => fakeWalletApi({ address: `shielded:${address}` });

const connection = (address: string, over: Partial<Session> = {}): Session =>
  ({
    kind: "eip1193",
    ethAddress: address as `0x${string}`,
    accountKey: address,
    isConnected: true,
    isConnecting: false,
    chainSupported: true,
    layer: { kind: "eip1193", provider: {}, address },
    disconnect: () => {},
    switchChain: () => {},
    ...over,
  }) as Session;

describe("useBuildWallet", () => {
  it("stops serving the previous account's wallet while the next one is being built", async () => {
    const addrA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1";
    const addrB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1";
    const walletA = walletFor(addrA);
    // B's build never settles: it is blocked on an EIP-712 prompt the user has
    // not answered. That window is when a stale wallet would be visible.
    const pendingB = deferred<WalletApi>();
    buildWallet.mockImplementation((_layer: unknown, _chain: unknown, accountKey: string) =>
      accountKey === addrA ? Promise.resolve(walletA) : pendingB.promise,
    );

    const { result, rerender } = renderHook((session: Session) => useBuildWallet(session), {
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

    const { result, rerender } = renderHook((session: Session) => useBuildWallet(session), {
      initialProps: connection(addr),
    });
    await waitFor(() => expect(result.current.wallet).toBe(wallet));

    await act(async () => {
      rerender(connection(addr, { isConnected: false, layer: undefined, accountKey: undefined }));
    });
    expect(result.current.wallet).toBeUndefined();

    // Reconnecting must not unmask the retained value: `disconnect` disposed its
    // scanner pool and prover, so it is dead rather than stale. A build that has
    // not resolved leaves `wallet` undefined rather than `ready`.
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

    const { unmount } = renderHook((session: Session) => useBuildWallet(session), {
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

    const { result } = renderHook((session: Session) => useBuildWallet(session), {
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
