// A registration is a tracked spend: it must show in the stepper and the in-flight notice like any
// other, and only a registration the chain confirmed is remembered as this account's handle.

import { evmAddress } from "@lelantos-org/sdk";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useClaimedHandle } from "@/features/names";
import { opScope, resetOpsForTest, useOpsInFlight } from "@/features/tx";
import { deferred } from "@/test/async";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { hexAddress, SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { renderQueryHook } from "@/test/render";
import { lastArg } from "@/test/spies";
import { useRegisterName } from "./use-register-name";

const CHAIN_ID = 31337n;
const PUBLISHED = "lelantos1published";

const addPendingMany = vi.fn();
const trackTxLifecycle = vi.fn();
const invalidate = vi.fn();
const registerName = vi.fn();
const wallet = fakeWalletApi({ address: SHIELDED_ADDRESS, registerName });

vi.mock("@/features/tx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/tx")>()),
  trackTxLifecycle: (...a: unknown[]) => trackTxLifecycle(...a),
  addPendingMany: (...a: unknown[]) => addPendingMany(...a),
  clearPending: () => {},
}));
vi.mock("@/features/chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/chain")>()),
  ...(await import("@/test/fakes/chain")).activeChainHooks({
    chainId: 31337n,
    nameRegistrarAddress: evmAddress("0x7777777777777777777777777777777777777777"),
  }),
}));
vi.mock("@/features/wallet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/wallet")>()),
  useWalletInstance: () => wallet,
  useInvalidateWalletState: () => invalidate,
  isProverLoaded: () => true,
  whenProverLoaded: async () => {},
}));

function landed(registered: boolean | undefined) {
  return {
    kind: "registerName",
    txHash: "0xtx",
    asset: { id: 1n },
    label: "mehow",
    address: PUBLISHED,
    controller: hexAddress("c0"),
    registered,
    registrationFee: { asset: 1n, amount: 5n, baseUnits: 5n },
    fees: { relayer: null, protocol: null },
    change: 40n,
    commitments: ["0xcm0"],
    ownCommitments: [],
  };
}

const claimedHandle = () =>
  renderHook(() => useClaimedHandle(CHAIN_ID, SHIELDED_ADDRESS)).result.current;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetOpsForTest();
  invalidate.mockResolvedValue(undefined);
  registerName.mockResolvedValue(landed(true));
});

describe("useRegisterName", () => {
  it("asks the wallet for the label alone, naming no account", async () => {
    const { result } = renderQueryHook(() => useRegisterName());

    await act(() => result.current.mutation.mutateAsync({ label: "mehow", asset: 1n }));

    const args = lastArg(registerName) as Record<string, unknown>;
    expect(Object.keys(args).sort()).toEqual(
      ["asset", "autoConsolidate", "feeAsset", "label", "maxFee", "onPhase"].sort(),
    );
    expect(args).toMatchObject({ label: "mehow", asset: 1n, autoConsolidate: true });
  });

  it("runs the spend's steps and ends them when the relayer has landed it", async () => {
    const sent = deferred<ReturnType<typeof landed>>();
    registerName.mockImplementation((args: { onPhase(p: string): void }) => {
      args.onPhase("preparing");
      args.onPhase("proving");
      return sent.promise;
    });
    const { result } = renderQueryHook(() => useRegisterName());

    act(() => void result.current.mutation.mutateAsync({ label: "mehow" }));
    await waitFor(() => expect(result.current.progress.phase).toBe("proving"));
    expect(result.current.progress.steps.map((s) => s.id)).toEqual([
      "preparing",
      "proving",
      "submitting",
      "mined",
    ]);

    await act(async () => sent.resolve(landed(true)));
    expect(result.current.progress).toMatchObject({ phase: "mined", done: true });
  });

  it("is listed among the account's transactions in flight, and for a reload to report", async () => {
    const sent = deferred<ReturnType<typeof landed>>();
    registerName.mockReturnValue(sent.promise);
    const scope = opScope(CHAIN_ID, SHIELDED_ADDRESS);
    const { result } = renderQueryHook(() => ({
      action: useRegisterName(),
      inFlight: useOpsInFlight(scope),
    }));

    act(() => void result.current.action.mutation.mutateAsync({ label: "mehow" }));
    await waitFor(() => expect(result.current.inFlight).toHaveLength(1));
    expect(result.current.inFlight[0]).toMatchObject({ label: "handle transaction", scope });
    expect(sessionStorage.getItem("lelantos:ops:running")).toContain("handle transaction");

    await act(async () => sent.resolve(landed(true)));
    await waitFor(() => expect(result.current.inFlight).toHaveLength(0));
  });

  it("tracks the landed transaction with its pending overlay", async () => {
    const { result } = renderQueryHook(() => useRegisterName());

    await act(() => result.current.mutation.mutateAsync({ label: "mehow" }));

    await waitFor(() => expect(trackTxLifecycle).toHaveBeenCalledOnce());
    expect(trackTxLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ label: "handle transaction", txHash: "0xtx" }),
    );
    expect(addPendingMany).toHaveBeenCalledWith(CHAIN_ID, expect.anything(), [
      { asset: 1n, pendingIn: 40n, outflow: 5n },
    ]);
  });

  it("remembers a handle the chain confirmed, under the shielded account", async () => {
    const { result } = renderQueryHook(() => useRegisterName());

    await act(() => result.current.mutation.mutateAsync({ label: "mehow" }));

    expect(claimedHandle()).toMatchObject({ label: "mehow", address: PUBLISHED });
  });

  it.each([
    ["refunded", false],
    ["of unknown outcome", undefined],
  ])("does not remember a registration that was %s", async (_, registered) => {
    registerName.mockResolvedValue(landed(registered));
    const { result } = renderQueryHook(() => useRegisterName());

    await act(() => result.current.mutation.mutateAsync({ label: "mehow" }));

    expect(result.current.mutation.data).toMatchObject({ registered });
    expect(claimedHandle()).toBeUndefined();
  });

  it("fails without tracking anything when the wallet refuses", async () => {
    registerName.mockRejectedValue(new Error("taken"));
    const { result } = renderQueryHook(() => useRegisterName());

    await act(() => result.current.mutation.mutateAsync({ label: "mehow" }).catch(() => {}));

    expect(result.current.progress.phase).toBe("failed");
    expect(trackTxLifecycle).not.toHaveBeenCalled();
    expect(claimedHandle()).toBeUndefined();
  });
});
