// Drives the broadcast → mined → flushed toast lifecycle for a tx.
// Fire-and-forget: callers `void trackTxLifecycle(...)` and let it
// settle in the background.

import type { Hex32 } from "@lelantos-org/sdk";
import type { FlushWait } from "@lelantos-org/sdk/relayer";
import type { WalletApi } from "@lelantos-org/sdk/wallet";
import type { ChainEntry } from "@/config/chains";
import { isTerminal, type TxPhase } from "@/features/actions/tx/tx-progress";
import { depositStream, preopenDepositStream } from "@/features/relayer/deposit-stream";
import { createLogger } from "@/shared/lib/logger";
import { toastTx } from "@/shared/lib/toast";

const log = createLogger("tx:lifecycle");

const FLUSH_TIMEOUT_MS = 5 * 60_000;
const SCANNER_CATCHUP_TIMEOUT_MS = 60_000;
const LIFECYCLE_HARD_TIMEOUT_MS = 6 * 60_000;

export interface TrackOpts {
  wallet: WalletApi;
  label: string;
  txHash: Hex32;
  /// Deposit/swap-only. When present, mining is followed by a wait for the
  /// relayer's flushBatch to clear this id before scanning for own outputs.
  /// This is the on-chain deposit id, which the relayer publishes on its SSE
  /// stream as `deposit_id`.
  depositId?: bigint;
  /// Commitments produced for this wallet that must land in the local note
  /// store before the balance is declared "settled". Empty for transfers
  /// where neither output goes to self.
  ownCommitments?: Hex32[];
  /// Called whenever the tx reaches a state that should retrigger a
  /// wallet-state refresh (mined, flushed, scanner caught up). Errors are
  /// swallowed; the caller's react-query layer is the source of truth.
  onProgress?: () => void;
  /// Called once the lifecycle reaches a terminal state. Use to clear
  /// pending-tx overlays. Always fires exactly once.
  onSettled?: () => void;
  /// Optional phase signal for in-form steppers. Fired at each transition
  /// (mined, flushed, settled, failed). Errors swallowed.
  onPhase?: (phase: TxPhase) => void;
  /// Chain the tx was submitted on. Passed in rather than read from a global
  /// so a lifecycle that outlives a chain switch keeps watching its own chain,
  /// and links to that chain's explorer rather than the one now selected.
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
  // Open the SSE source before waiting for receipt so a fast relayer
  // can't publish flush before the listener is attached.
  if (depositId !== undefined) preopenDepositStream(opts.chain.chainId);
  let settled = false;
  /// Whether a terminal phase has already reached the form.
  ///
  /// `settle` fills the gap when one has not. Three exits used to settle
  /// without ever emitting a phase — the hard timeout, an adapter with no
  /// `waitTxReceipt`, and the `ok` path when there was nothing to wait for —
  /// which left `useTxProgress.done` false forever. The stepper then span on a
  /// mid-list step with no way to clear it, because `useClearFinishedOp` is
  /// gated on `done`; only a page reload got rid of it.
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
    // The tx was broadcast and we simply stopped watching. Say so rather than
    // leaving the toast silent and the stepper mid-flight.
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
      // Nothing was ever observed, so the outcome is genuinely unknown.
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
      // The tx is already mined by this point, so an unobserved flush is not
      // a failed deposit — and `phase("failed")` used to sit right here,
      // painting the stepper red under a toast that correctly called it a
      // warning. `unknown` is the honest terminal: done watching, outcome not
      // observed, explorer link in the toast. A dead feed (a relayer that does
      // not serve the endpoint) falls through to the scanner wait, which
      // settles the balance either way.
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
        // Best-effort — pending overlay falls back to react-query polling.
      }
    }
    // Mined and nothing left to wait for. `settled` rather than `unknown`:
    // block inclusion was observed, so the scanner catching up is a matter of
    // time rather than an open question.
    settle("ok", "settled");
  } catch (err) {
    t.failed(err);
    phase("failed");
    settle("error", "failed");
  }
}
