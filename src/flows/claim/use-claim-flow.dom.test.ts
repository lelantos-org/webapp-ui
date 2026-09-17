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

vi.mock("@/features/chain", () => ({ useChainRegistry: () => [CHAIN] }));
vi.mock("@/features/wallet-kinds", () => ({
  currentWalletChainId: () => 31337n,
  eip1193Store: { getState: () => ({ chainId: 31337 }), subscribe: () => () => {} },
  NSK_HEX_LEN: 64,
  nskFieldFromHex: () => ({ ok: true, value: 1n }),
  nskHexFromField: () => NSK_HEX,
}));
vi.mock("@/features/wallet", () => ({
  useWallet: () => fakeWalletContext({ wallet: fakeWalletApi({ address: "lelantos1me" }) }),
  useSession: () => ({ layer: { kind: "eip1193" } }),
  useScannerOwner: () => ({ hold: vi.fn(), discard: vi.fn(), release: vi.fn() }),
}));
vi.mock("@/features/claim-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/claim-links")>()),
  buildEphemeralWallet: eph.build,
  sweepEphemeral: eph.sweep,
  clearEphemeralStore: vi.fn(async () => {}),
  summarizeEphemeralNotes: async () => [{ asset: 1n, amount: 5n, notes: 1 }],
}));

beforeEach(() => {
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
