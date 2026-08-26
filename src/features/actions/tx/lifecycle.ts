// Drives the broadcast → mined → flushed toast lifecycle for a tx.
// Fire-and-forget: callers `void trackTxLifecycle(...)` and let it settle in the
// background.

import type { Hex32 } from "@lelantos-org/sdk";
import type { FlushWait } from "@lelantos-org/sdk/relayer";
import type { WalletApi } from "@lelantos-org/sdk/wallet";
import type { ChainEntry } from "@/config/chains";
import { depositStream, preopenDepositStream } from "@/features/relayer";
import { createLogger } from "@/shared/lib/logger";
import { toastTx } from "@/shared/lib/toast";
import { isTerminal, type TxPhase } from "./tx-progress";

const log = createLogger("tx:lifecycle");

const FLUSH_TIMEOUT_MS = 5 * 60_000;
const SCANNER_CATCHUP_TIMEOUT_MS = 60_000;
const LIFECYCLE_HARD_TIMEOUT_MS = 6 * 60_000;

export interface TrackOpts {
  wallet: WalletApi;
  label: string;
  txHash: Hex32;
  /// Deposit and swap only. When present, mining is followed by a wait for the
  /// relayer's `flushBatch` to clear this id before scanning for own outputs.
  /// This is the on-chain deposit id, published on the relayer's SSE stream as
  /// `deposit_id`.
  depositId?: bigint;
  /// Commitments produced for this wallet that must land in the local note store
  /// before the balance is declared settled. Empty for transfers where neither
  /// output goes to self.
  ownCommitments?: Hex32[];
  /// Called whenever the tx reaches a state that should retrigger a wallet-state
  /// refresh: mined, flushed, or scanner caught up. Errors are swallowed; the
  /// caller's react-query layer is the source of truth.
  onProgress?: () => void;
  /// Called once the lifecycle reaches a terminal state, to clear pending-tx
  /// overlays. Always fires exactly once.
  onSettled?: () => void;
  /// Optional phase signal for in-form steppers, fired at each transition:
  /// mined, flushed, settled, failed. Errors are swallowed.
  onPhase?: (phase: TxPhase) => void;
  /// Chain the tx was submitted on. Passed in rather than read from a global, so
  /// a lifecycle outliving a chain switch keeps watching its own chain and links
  /// to that chain's explorer.
  chain: ChainEntry;
}

/// Run `fn` with a signal that aborts after `ms`. The timer is always cleared,
/// so a fast result leaves nothing pending.
async function withAbortTimeout<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function trackTxLifecycle(opts: TrackOpts): Promise<void> {
  const t = toastTx(opts.label, opts.txHash, opts.chain.explorerUrl);
  // Bound once so the narrowing survives into the callbacks below.
  const { depositId, ownCommitments } = opts;
  // Open the SSE source before waiting for the receipt, so a fast relayer cannot
  // publish the flush before the listener is attached.
  if (depositId !== undefined) preopenDepositStream(opts.chain.chainId);
  let settled = false;
  /// Whether a terminal phase has already reached the form.
  ///
  /// `settle` emits a fallback phase when none has. Without it, the exits that
  /// settle without emitting — the hard timeout, an adapter with no
  /// `waitTxReceipt`, and the `ok` path with nothing to wait for — would leave
  /// `useTxProgress.done` false, stranding the stepper on a mid-list step that
  /// `useClearFinishedOp` cannot clear.
  let emittedTerminal = false;
  const phase = (p: TxPhase) => {
    if (isTerminal(p)) emittedTerminal = true;
    try {
      opts.onPhase?.(p);
    } catch {
      // ignore
    }
  };
  const settle = (reason: string, fallback: TxPhase) => {
    if (settled) return;
    settled = true;
    clearTimeout(hardTimer);
    if (!emittedTerminal) phase(fallback);
    log.debug("settled", { reason, txHash: opts.txHash });
    try {
      opts.onSettled?.();
    } catch {
      // ignore
    }
  };
  const hardTimer = setTimeout(() => {
    // The tx was broadcast and watching stopped. Reported, rather than leaving
    // the toast silent and the stepper mid-flight.
    t.timedOut();
    settle("hard-timeout", "unknown");
  }, LIFECYCLE_HARD_TIMEOUT_MS);
  const tick = () => {
    try {
      opts.onProgress?.();
    } catch {
      // ignore
    }
  };

  try {
    if (!opts.wallet.chain.waitTxReceipt) {
      // Nothing was observed, so the outcome is unknown.
      settle("no-receipt-adapter", "unknown");
      return;
    }
    const receipt = await opts.wallet.chain.waitTxReceipt(opts.txHash);
    if (receipt.status === 0) {
      t.failed(new Error(`tx reverted at block ${receipt.blockNumber}`));
      phase("failed");
      settle("reverted", "failed");
      return;
    }
    t.mined(receipt.blockNumber);
    phase("mined");
    tick();

    if (depositId !== undefined) {
      const wait: FlushWait = await withAbortTimeout(FLUSH_TIMEOUT_MS, (signal) =>
        depositStream(opts.chain.chainId).awaitFlush(depositId, { signal }),
      );
      // The tx is already mined here, so an unobserved flush is not a failed
      // deposit. `unknown` is the correct terminal: watching has stopped, the
      // outcome was not observed, and the toast carries the explorer link. A dead
      // feed — a relayer not serving the endpoint — falls through to the scanner
      // wait, which settles the balance either way.
      if (wait.kind === "aborted") {
        t.timedOut();
        settle("flush-timeout", "unknown");
        return;
      }
      if (wait.kind === "closed") {
        log.warn("no flush confirmation available; relying on scanner catch-up");
      } else {
        t.flushed(wait.blockNumber);
        phase("flushed");
        tick();
      }
    }

    if (ownCommitments && ownCommitments.length > 0) {
      try {
        await withAbortTimeout(SCANNER_CATCHUP_TIMEOUT_MS, (signal) =>
          opts.wallet.awaitCommitments(ownCommitments, { signal }),
        );
        phase("settled");
        tick();
      } catch {
        // Best-effort: the pending overlay falls back to react-query polling.
      }
    }
    // Mined with nothing left to wait for. `settled` rather than `unknown`,
    // since block inclusion was observed and the scanner catching up is a matter
    // of time.
    settle("ok", "settled");
  } catch (err) {
    t.failed(err);
    phase("failed");
    settle("error", "failed");
  }
}
