// Every exit from the lifecycle has to leave the form in a terminal state.
//
// It is not enough that the promise settles: `useTxProgress.done` only flips on
// a terminal phase, and `useClearFinishedOp` is gated on `done`. A path that
// settles silently leaves a spinner mid-stepper that the user cannot clear
// without reloading the page.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TxPhase } from "./tx-progress";

const awaitFlush = vi.fn();

vi.mock("@/features/relayer/deposit-stream", () => ({
  preopenDepositStream: vi.fn(),
  depositStream: () => ({ awaitFlush }),
}));

const toastHandle = {
  mined: vi.fn(),
  flushed: vi.fn(),
  failed: vi.fn(),
  timedOut: vi.fn(),
};
vi.mock("@/shared/lib/toast", () => ({
  toastTx: () => toastHandle,
}));

const { trackTxLifecycle } = await import("./lifecycle");

const chain = { chainId: 1n, explorerUrl: undefined } as never;

function harness(over: Record<string, unknown> = {}) {
  const phases: TxPhase[] = [];
  const onSettled = vi.fn();
  const opts = {
    wallet: {
      chain: { waitTxReceipt: vi.fn().mockResolvedValue({ status: 1, blockNumber: 10 }) },
      awaitCommitments: vi.fn().mockResolvedValue(undefined),
    },
    chain,
    label: "deposit",
    txHash: "0xdead",
    onPhase: (p: TxPhase) => phases.push(p),
    onSettled,
    ...over,
  };
  return { opts, phases, onSettled };
}

beforeEach(() => {
  vi.useFakeTimers();
  awaitFlush.mockReset();
  for (const fn of Object.values(toastHandle)) fn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trackTxLifecycle", () => {
  it("emits a terminal phase when the adapter cannot read receipts", async () => {
    const { opts, phases, onSettled } = harness({
      wallet: { chain: {}, awaitCommitments: vi.fn() },
    });

    await trackTxLifecycle(opts as never);

    expect(onSettled).toHaveBeenCalledOnce();
    expect(phases).toContain("unknown");
  });

  it("emits a terminal phase for a mined tx with nothing left to wait for", async () => {
    const { opts, phases } = harness();

    await trackTxLifecycle(opts as never);

    expect(phases).toEqual(["mined", "settled"]);
  });

  it("marks a reverted tx failed and does not append a second terminal", async () => {
    const { opts, phases } = harness({
      wallet: {
        chain: { waitTxReceipt: vi.fn().mockResolvedValue({ status: 0, blockNumber: 11 }) },
        awaitCommitments: vi.fn(),
      },
    });

    await trackTxLifecycle(opts as never);

    expect(phases).toEqual(["failed"]);
    expect(toastHandle.failed).toHaveBeenCalledOnce();
  });

  it("does not report a mined deposit as failed when the flush is never observed", async () => {
    // The tx is on chain. Painting the stepper red under a toast that calls it
    // a warning told the user two different things about the same deposit.
    awaitFlush.mockResolvedValue({ kind: "aborted" });
    const { opts, phases } = harness({ depositId: 7n });

    await trackTxLifecycle(opts as never);

    expect(phases).not.toContain("failed");
    expect(phases.at(-1)).toBe("unknown");
    expect(toastHandle.timedOut).toHaveBeenCalledOnce();
  });

  it("reports flushed then settled on the happy deposit path", async () => {
    awaitFlush.mockResolvedValue({ kind: "flushed", blockNumber: 12 });
    const { opts, phases } = harness({ depositId: 7n, ownCommitments: ["0xc0"] });

    await trackTxLifecycle(opts as never);

    expect(phases).toEqual(["mined", "flushed", "settled"]);
  });

  it("settles with a terminal phase when the hard timeout fires", async () => {
    // Nothing resolves, so only the hard timer ends the lifecycle.
    const { opts, phases, onSettled } = harness({
      wallet: {
        chain: { waitTxReceipt: vi.fn().mockReturnValue(new Promise(() => {})) },
        awaitCommitments: vi.fn(),
      },
    });

    void trackTxLifecycle(opts as never);
    await vi.advanceTimersByTimeAsync(6 * 60_000 + 1);

    expect(onSettled).toHaveBeenCalledOnce();
    expect(phases).toEqual(["unknown"]);
    expect(toastHandle.timedOut).toHaveBeenCalledOnce();
  });
});
