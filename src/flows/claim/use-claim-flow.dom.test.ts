import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANCELED_IN_WALLET } from "@/shared/lib/errors";
import { fakeWalletApi, fakeWalletContext } from "@/test/fakes/wallet";
import { makeChain } from "@/test/fixtures/chains";
import { useClaimFlow } from "./use-claim-flow";

const CHAIN = makeChain({ chainName: "Anvil" });
const NSK_HEX = "ab".repeat(32);

const eph = vi.hoisted(() => ({
  build: vi.fn(),
  sweep: vi.fn(),
}));
/// The EVM wallet's chain; `undefined` is a passkey session.
const evm = vi.hoisted(() => ({ chainId: 31337 as number | undefined }));

vi.mock("@/features/chain", () => ({
  useChainRegistry: () => [CHAIN],
  useEarlyChainRegistry: () => ({ loaded: true, failed: false }),
}));
vi.mock("@/features/wallet-kinds", () => ({
  currentWalletChainId: () => (evm.chainId === undefined ? undefined : BigInt(evm.chainId)),
  eip1193Store: { getState: () => ({ chainId: evm.chainId }), subscribe: () => () => {} },
  NSK_HEX_LEN: 64,
  nskFieldFromHex: () => ({ ok: true, value: 1n }),
  nskHexFromField: () => NSK_HEX,
}));
/// `false` is a visitor who has not connected a wallet yet.
const session = vi.hoisted(() => ({ connected: true }));
const preloadProver = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/features/wallet", () => ({
  useWallet: () =>
    fakeWalletContext(
      session.connected ? { wallet: fakeWalletApi({ address: "lelantos1me" }) } : {},
    ),
  useScannerOwner: () => ({ hold: vi.fn(), discard: vi.fn(), release: vi.fn() }),
  preloadProverWorker: preloadProver,
}));
vi.mock("@/features/ops", async () => {
  const { stepsFor } = await import("@/features/tx");
  return {
    spendSteps: () => stepsFor("transfer"),
    spendPhases: (onPhase: (phase: string) => void) => onPhase,
  };
});
vi.mock("@/features/claim-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/claim-links")>()),
  buildEphemeralWallet: eph.build,
  sweepEphemeral: eph.sweep,
  clearEphemeralStore: vi.fn(async () => {}),
  scanEphemeralBalances: async () => [{ asset: 1n, amount: 5n, notes: 1 }],
}));

beforeEach(() => {
  session.connected = true;
  preloadProver.mockClear();
  evm.chainId = 31337;
  window.history.replaceState(null, "", `/claim#7a69:${NSK_HEX}`);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useClaimFlow failures", () => {
  it("shows the user's line for a failed scan and logs the cause", async () => {
    const cause = new Error(`fetch failed: 0x${"ef".repeat(40)}`);
    eph.build.mockRejectedValueOnce(cause);

    const { result } = renderHook(() => useClaimFlow());
    await waitFor(() => expect(result.current.phase.kind).toBe("error"));

    const phase = result.current.phase as { message: string };
    expect(phase.message).toBe("Something went wrong. Please try again.");
    expect(vi.mocked(console.error).mock.calls.flat()).toContain(cause);
  });

  it("reports a sweep the user cancelled as a cancellation", async () => {
    eph.build.mockResolvedValueOnce({ sync: vi.fn(async () => {}) });
    eph.sweep.mockRejectedValueOnce({ code: 4001, message: "User rejected the request." });

    const { result } = renderHook(() => useClaimFlow());
    await waitFor(() => expect(result.current.phase.kind).toBe("ready"));
    await act(() => result.current.claim(1n));

    const phase = result.current.phase as { kind: string; message: string };
    expect(phase.kind).toBe("error");
    expect(phase.message).toBe(CANCELED_IN_WALLET);
  });
});

describe("useClaimFlow chain check", () => {
  it("sweeps in a session whose wallet has no EVM chain", async () => {
    evm.chainId = undefined;
    eph.build.mockResolvedValueOnce({ sync: vi.fn(async () => {}) });
    eph.sweep.mockResolvedValueOnce({ txHash: "0xabc" });

    const { result } = renderHook(() => useClaimFlow());
    await waitFor(() => expect(result.current.phase.kind).toBe("ready"));
    await act(() => result.current.claim(1n));

    expect(eph.sweep).toHaveBeenCalledTimes(1);
    expect(result.current.phase.kind).toBe("done");
  });

  it("refuses to sweep once the wallet has moved to another network", async () => {
    eph.build.mockResolvedValueOnce({ sync: vi.fn(async () => {}) });

    const { result } = renderHook(() => useClaimFlow());
    await waitFor(() => expect(result.current.phase.kind).toBe("ready"));
    evm.chainId = 1;
    await act(() => result.current.claim(1n));

    expect(eph.sweep).not.toHaveBeenCalled();
    expect(result.current.phase.kind).toBe("error");
  });
});

describe("useClaimFlow before a wallet is connected", () => {
  it("shows what the link holds, read-only, and warms the prover for the claim", async () => {
    session.connected = false;
    eph.build.mockResolvedValueOnce({ sync: vi.fn(async () => {}) });

    const { result } = renderHook(() => useClaimFlow());
    await waitFor(() => expect(result.current.phase.kind).toBe("ready"));

    expect(result.current.connected).toBe(false);
    expect(result.current.phase).toMatchObject({ balances: [{ asset: 1n, amount: 5n }] });
    // No session layer is lent: the link's wallet is read-only.
    expect(eph.build).toHaveBeenLastCalledWith(NSK_HEX, undefined, CHAIN);
    expect(preloadProver).toHaveBeenCalledOnce();
  });

  it("does not sweep without a wallet to claim into", async () => {
    session.connected = false;
    eph.build.mockResolvedValueOnce({ sync: vi.fn(async () => {}) });

    const { result } = renderHook(() => useClaimFlow());
    await waitFor(() => expect(result.current.phase.kind).toBe("ready"));
    await act(() => result.current.claim(1n));

    expect(eph.sweep).not.toHaveBeenCalled();
    expect(result.current.phase.kind).toBe("ready");
  });
});

describe("useClaimFlow sweep", () => {
  it("walks the transfer's steps as the sweep reports them", async () => {
    eph.build.mockResolvedValueOnce({ sync: vi.fn(async () => {}) });
    eph.sweep.mockImplementationOnce(async (_eph, _dest, _asset, onPhase) => {
      onPhase("proving");
      return "0xabc";
    });

    const { result } = renderHook(() => useClaimFlow());
    await waitFor(() => expect(result.current.phase.kind).toBe("ready"));
    await act(() => result.current.claim(1n));

    expect(result.current.progress.steps.map((s) => s.id)).toContain("proving");
    expect(result.current.progress.phase).toBe("proving");
    expect(result.current.phase.kind).toBe("done");
  });

  it("looks again at a link that held nothing", async () => {
    eph.build.mockResolvedValue({ sync: vi.fn(async () => {}) });

    const { result } = renderHook(() => useClaimFlow());
    await waitFor(() => expect(result.current.phase.kind).toBe("ready"));
    expect(eph.build).toHaveBeenCalledTimes(1);

    act(() => result.current.rescan());
    await waitFor(() => expect(eph.build).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.phase.kind).toBe("ready"));
  });
});
