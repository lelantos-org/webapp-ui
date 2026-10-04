import type { WalletApi } from "@lelantos-org/sdk";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "@/test/async";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { makeChain } from "@/test/fixtures/chains";
import type { Session } from "../session/session";

const buildWallet = vi.fn();

vi.mock("./build-wallet", () => ({
  buildWallet: (...args: unknown[]) => buildWallet(...args),
}));
vi.mock("@/features/chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/chain")>()),
  useActiveChainOrUndefined: () => chain,
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

const baseChain = makeChain({ chainId: 1n, chainName: "test" });
let chain = baseChain;

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
    registry: { status: "ready" },
    layer: { kind: "eip1193", provider: {}, address },
    disconnect: () => {},
    ...over,
  }) as Session;

beforeEach(() => {
  chain = baseChain;
});

describe("useBuildWallet", () => {
  it("keeps the wallet when a registry refresh hands out an equal chain entry", async () => {
    const addr = "0xcccccccccccccccccccccccccccccccccccccc01";
    buildWallet.mockReset();
    buildWallet.mockImplementation(() => Promise.resolve(walletFor(addr)));
    const session = connection(addr);

    const { result, rerender } = renderHook((s: Session) => useBuildWallet(s), {
      initialProps: session,
    });
    await waitFor(() => expect(result.current.wallet).toBeDefined());
    const first = result.current.wallet;

    chain = { ...baseChain, tokens: [...baseChain.tokens] };
    await act(async () => {
      rerender(session);
    });

    expect(buildWallet).toHaveBeenCalledTimes(1);
    expect(result.current.wallet).toBe(first);
  });

  it("rebuilds when the chain entry names another pool", async () => {
    const addr = "0xdddddddddddddddddddddddddddddddddddddd01";
    buildWallet.mockReset();
    buildWallet.mockImplementation(() => Promise.resolve(walletFor(addr)));
    const session = connection(addr);

    const { result, rerender } = renderHook((s: Session) => useBuildWallet(s), {
      initialProps: session,
    });
    await waitFor(() => expect(result.current.wallet).toBeDefined());

    chain = { ...baseChain, maspAddress: `0x${"12".repeat(20)}` as typeof baseChain.maspAddress };
    await act(async () => {
      rerender(session);
    });

    await waitFor(() => expect(buildWallet).toHaveBeenCalledTimes(2));
  });

  it("stops serving the previous account's wallet while the next one is being built", async () => {
    const addrA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1";
    const addrB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1";
    const walletA = walletFor(addrA);
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

    const pending = deferred<WalletApi>();
    buildWallet.mockReturnValue(pending.promise);
    await act(async () => {
      rerender(connection(addr));
    });
    expect(result.current.wallet).toBeUndefined();
  });
});

describe("after the key is derived", () => {
  const addr = "0xffffffffffffffffffffffffffffffffffffff01";

  /// A build that reports its key and then waits on `pending`.
  function buildAwaiting(pending: Promise<WalletApi>) {
    buildWallet.mockReset();
    buildWallet.mockImplementation(
      (_layer: unknown, _chain: unknown, _key: string, onKey: () => void) => {
        onKey();
        return pending;
      },
    );
  }

  it("says so, so the status can move off the signature prompt", async () => {
    const pending = deferred<WalletApi>();
    buildAwaiting(pending.promise);

    const { result } = renderHook((s: Session) => useBuildWallet(s), {
      initialProps: connection(addr),
    });
    await waitFor(() => expect(result.current.keyResolved).toBe(true));
    expect(result.current.wallet).toBeUndefined();

    await act(async () => pending.resolve(walletFor(addr)));
    await waitFor(() => expect(result.current.wallet).toBeDefined());
  });

  it("gives up waiting after a minute, and still connects if the build lands later", async () => {
    vi.useFakeTimers();
    try {
      const pending = deferred<WalletApi>();
      buildAwaiting(pending.promise);

      const { result } = renderHook((s: Session) => useBuildWallet(s), {
        initialProps: connection(addr),
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(59_000);
      });
      expect(result.current.error).toBeUndefined();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(result.current.error).toMatch(/taking too long/);

      await act(async () => {
        pending.resolve(walletFor(addr));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.wallet).toBeDefined();
      expect(result.current.error).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("build ownership", () => {
  it("releases a build that no consumer adopted", async () => {
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
    const addr = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee01";
    const wallet = walletFor(addr);
    buildWallet.mockResolvedValue(wallet);

    const { result } = renderHook((session: Session) => useBuildWallet(session), {
      initialProps: connection(addr),
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });

    await waitFor(() => expect(result.current.wallet).toBe(wallet));
    expect(buildWallet).toHaveBeenCalledOnce();
    expect(releaseScanner).not.toHaveBeenCalled();
  });
});
