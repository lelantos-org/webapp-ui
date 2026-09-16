// @vitest-environment jsdom
// Every exit from the lifecycle has to leave the form in a terminal state.
//
// It is not enough that the promise settles: `useTxProgress.done` only flips on
// a terminal phase, and `useClearFinishedOp` is gated on `done`. A path that
// settles silently leaves a spinner mid-stepper that the user cannot clear
// without reloading the page.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeChain } from "@/test/fixtures/chains";
import type { TxPhase } from "../progress/tx-progress";

const awaitDeposit = vi.fn();

const toastHandle = {
  failed: vi.fn(),
  timedOut: vi.fn(),
};
vi.mock("./toast-tx", () => ({
  toastTx: () => toastHandle,
}));

const { trackTxLifecycle } = await import("./lifecycle");

const chain = makeChain({ chainId: 1n });

function harness(over: Record<string, unknown> = {}) {
  const phases: TxPhase[] = [];
  const onSettled = vi.fn();
  const opts = {
    wallet: {
      chain: { waitTxReceipt: vi.fn().mockResolvedValue({ status: 1, blockNumber: 10 }) },
      awaitCommitments: vi.fn().mockResolvedValue({ status: "seen", missing: [], attempts: 1 }),
      awaitDeposit,
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
    awaitDeposit.mockResolvedValue({ status: "timeout", missing: ["0xc0"], attempts: 3 });
    const { opts, phases } = harness({ escrow: { commitment: "0xc0" } });

    await trackTxLifecycle(opts as never);

    expect(phases).not.toContain("failed");
    expect(phases.at(-1)).toBe("unknown");
    expect(toastHandle.timedOut).toHaveBeenCalledOnce();
  });

  it("reports flushed then settled on the happy deposit path", async () => {
    awaitDeposit.mockResolvedValue({ status: "seen", missing: [], attempts: 2 });
    const { opts, phases } = harness({ escrow: { commitment: "0xc0" }, ownCommitments: ["0xc0"] });

    await trackTxLifecycle(opts as never);

    expect(phases).toEqual(["mined", "flushed", "settled"]);
  });

  it("does not report a mined deposit as failed when the wait itself fails", async () => {
    awaitDeposit.mockRejectedValue(new Error("fmd unreachable"));
    const { opts, phases } = harness({ escrow: { commitment: "0xc0" } });

    await trackTxLifecycle(opts as never);

    expect(phases).toEqual(["mined", "unknown"]);
  });

  it("settles a spend without claiming the scan caught up when it did not", async () => {
    const { opts, phases } = harness({ ownCommitments: ["0xc1"] });
    opts.wallet.awaitCommitments.mockResolvedValue({
      status: "timeout",
      missing: ["0xc1"],
      attempts: 30,
    });

    await trackTxLifecycle(opts as never);

    expect(phases).toEqual(["mined", "settled"]);
    expect(opts.wallet.awaitCommitments).toHaveBeenCalledWith(["0xc1"], { timeoutMs: 60_000 });
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
