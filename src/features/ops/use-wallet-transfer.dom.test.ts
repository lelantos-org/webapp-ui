// A wallet-level transfer writes its record before it spends, so `run` must see the chain the
// record names, and a broadcast transfer must reach the tracker even though `run` wraps it.

import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetOpsForTest } from "@/features/tx";
import { fakeWalletApi } from "@/features/wallet/testing";
import { type AppScene, renderAppHook } from "@/test/app";
import { deferred } from "@/test/async";
import type { WalletTransferContext } from "./mutation";

const addPendingMany = vi.fn();
const trackTxLifecycle = vi.fn();
const invalidate = vi.fn();
const toastError = vi.fn();
const wallet = fakeWalletApi({ address: "lelantos1sender" });
const CONNECTED = { chain: { chainId: 31337n }, wallet: { wallet } };
const DISCONNECTED = { chain: { chainId: 31337n } };

vi.mock("@/features/tx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/tx")>()),
  trackTxLifecycle: (...a: unknown[]) => trackTxLifecycle(...a),
  addPendingMany: (...a: unknown[]) => addPendingMany(...a),
  clearPending: () => {},
}));
vi.mock("@/features/wallet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/wallet")>()),
  useInvalidateWalletState: () => invalidate,
  isProverLoaded: () => true,
  whenProverLoaded: async () => {},
}));
vi.mock("@/shared/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/toast")>()),
  toastError: (...a: unknown[]) => toastError(...a),
}));

const { useWalletTransfer } = await import("./mutation");

const tx = {
  kind: "transfer",
  txHash: "0xtx",
  asset: { id: 3n },
  amount: { amount: 5n },
  change: 0n,
  commitments: ["0xcm0"],
  ownCommitments: [],
} as never;

function hook(
  run: (w: unknown, input: string, ctx: WalletTransferContext) => Promise<never>,
  scene: AppScene = CONNECTED,
) {
  return renderAppHook(
    () =>
      useWalletTransfer<string, never>({
        key: "fund-agent",
        label: "fund agent",
        failed: "funding failed",
        run,
      }),
    scene,
  );
}

beforeEach(() => {
  resetOpsForTest();
  toastError.mockClear();
  invalidate.mockResolvedValue(undefined);
});

describe("useWalletTransfer", () => {
  it("hands `run` the wallet, the input and the active chain", async () => {
    const run = vi.fn(async () => ({ tx }) as never);
    const { result } = hook(run);

    await act(() => result.current.mutation.mutateAsync("input"));

    expect(run).toHaveBeenCalledWith(wallet, "input", expect.objectContaining({ chainId: 31337n }));
  });

  it("drives the stepper from the spend's phases", async () => {
    const sent = deferred<never>();
    const { result } = hook(async (_w, _i, ctx) => {
      ctx.onPhase("consolidating");
      ctx.onPhase("proving");
      return sent.promise;
    });

    act(() => void result.current.mutation.mutateAsync("input"));
    await waitFor(() => expect(result.current.progress.phase).toBe("proving"));
    expect(result.current.progress.steps.map((s) => s.id)).toContain("consolidating");

    await act(async () => sent.resolve({ tx } as never));
  });

  it("opens on the step `run` takes before it spends", async () => {
    const sent = deferred<never>();
    const lead = { id: "reserving", label: "Reserve an address" } as const;
    const { result } = renderAppHook(
      () =>
        useWalletTransfer<string, never>({
          label: "claim link",
          failed: "claim link failed",
          lead,
          run: () => sent.promise,
        }),
      CONNECTED,
    );

    act(() => void result.current.mutation.mutateAsync("input"));
    await waitFor(() => expect(result.current.progress.phase).toBe("reserving"));
    expect(result.current.progress.steps[0]).toEqual(lead);

    await act(async () => sent.resolve({ tx } as never));
  });

  it("tracks the wrapped transfer and resyncs the wallet", async () => {
    const { result } = hook(async () => ({ tx }) as never);

    await act(() => result.current.mutation.mutateAsync("input"));

    await waitFor(() => expect(trackTxLifecycle).toHaveBeenCalledOnce());
    expect(trackTxLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ label: "fund agent", txHash: "0xtx" }),
    );
    expect(addPendingMany).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalled();
  });

  it("marks the stepper failed, and leaves the telling to the form's own card", async () => {
    const boom = new Error("boom");
    const { result } = hook(async () => {
      throw boom;
    });

    await act(() => result.current.mutation.mutateAsync("input").catch(() => {}));

    expect(result.current.progress.phase).toBe("failed");
    expect(result.current.mutation.error).toBe(boom);
    expect(toastError).not.toHaveBeenCalled();
    expect(trackTxLifecycle).not.toHaveBeenCalled();
  });

  it("toasts a failure, under the spec's title, once the form that started it is gone", async () => {
    const boom = new Error("boom");
    const gate = deferred<never>();
    const { result, unmount } = hook(() => gate.promise);

    let run: Promise<unknown> = Promise.resolve();
    act(() => {
      run = result.current.mutation.mutateAsync("input").catch(() => {});
    });
    unmount();
    gate.reject(boom);
    await act(() => run);

    expect(toastError).toHaveBeenCalledWith("funding failed", boom);
  });

  it("returns to the form as it was when the user calls it off in their wallet", async () => {
    const rejected = { code: 4001, message: "User rejected the request." };
    const { result } = hook(async () => {
      throw rejected;
    });

    await act(() => result.current.mutation.mutateAsync("input").catch(() => {}));

    // No failed stepper and no error for a card to show: one toast says it was cancelled.
    expect(result.current.progress.phase).toBeUndefined();
    expect(result.current.progress.steps).toEqual([]);
    expect(result.current.mutation.error).toBeNull();
    expect(toastError).toHaveBeenCalledWith("funding failed", rejected);
  });

  it("ends the stepper when the spend resolves, since it resolves only once mined", async () => {
    const { result } = hook(async () => ({ tx }) as never);

    await act(() => result.current.mutation.mutateAsync("input"));

    expect(result.current.progress).toMatchObject({ phase: "mined", done: true });
  });

  it("refuses to run without a wallet", async () => {
    const run = vi.fn(async () => ({ tx }) as never);
    const { result } = hook(run, DISCONNECTED);

    await act(() => result.current.mutation.mutateAsync("input").catch(() => {}));

    expect(run).not.toHaveBeenCalled();
    expect(result.current.mutation.error?.message).toMatch(/wallet not ready/);
  });

  it("shows a form that mounts mid-op the op in flight, then its result", async () => {
    const sent = deferred<never>();
    const started = hook(async (_w, _i, ctx) => {
      ctx.onPhase("proving");
      return sent.promise;
    });
    act(() => void started.result.current.mutation.mutateAsync("input"));
    await waitFor(() => expect(started.result.current.progress.phase).toBe("proving"));
    started.unmount();

    // The user comes back to the screen: a new hook, with no mutation of its own.
    const back = hook(async () => ({ tx }) as never);
    expect(back.result.current.mutation.isPending).toBe(true);
    expect(back.result.current.progress.phase).toBe("proving");

    await act(async () => sent.resolve({ tx } as never));
    await waitFor(() => expect(back.result.current.mutation.isPending).toBe(false));
    expect(back.result.current.mutation.data).toEqual({ tx });
    await waitFor(() => expect(trackTxLifecycle).toHaveBeenCalledOnce());

    act(() => back.result.current.mutation.reset());
    expect(back.result.current.mutation.data).toBeUndefined();
  });

  it("keeps each instance's op to itself when the spec has no key", async () => {
    const sent = deferred<never>();
    const row = () =>
      renderAppHook(
        () =>
          useWalletTransfer<string, never>({
            label: "top up agent",
            failed: "top-up failed",
            run: () => sent.promise,
          }),
        CONNECTED,
      );
    const a = row();
    const b = row();

    act(() => void a.result.current.mutation.mutateAsync("input"));
    await waitFor(() => expect(a.result.current.mutation.isPending).toBe(true));
    expect(b.result.current.mutation.isPending).toBe(false);

    await act(async () => sent.resolve({ tx } as never));
  });
});
