// Drives the broadcast → mined → flushed toast lifecycle for a tx.
// Fire-and-forget: callers `void trackTxLifecycle(...)` and let it settle in the
// background.

import type { DepositEscrow, Hex32, WalletApi } from "@lelantos-org/sdk";
import type { ChainEntry } from "@/config/chains";
import { createLogger } from "@/shared/lib/logger";
import { isTerminal, type TxPhase } from "../progress/tx-progress";
import { toastTx } from "./toast-tx";

const log = createLogger("tx:lifecycle");

const FLUSH_TIMEOUT_MS = 5 * 60_000;
const SCANNER_CATCHUP_TIMEOUT_MS = 60_000;
const LIFECYCLE_HARD_TIMEOUT_MS = 6 * 60_000;

export interface TrackOpts {
  wallet: WalletApi;
  label: string;
  txHash: Hex32;
  /// Deposit only. When present, mining is followed by `awaitDeposit`: the
  /// escrowed note's commitment lands in the local store once the relayer has
  /// flushed it into the tree and the scanner has found it, which settles the
  /// deposit in one wait.
  escrow?: DepositEscrow | undefined;
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
  onPhase?: ((phase: TxPhase) => void) | undefined;
  /// Chain the tx was submitted on. Passed in rather than read from a global, so
  /// a lifecycle outliving a chain switch keeps watching its own chain and links
  /// to that chain's explorer.
  chain: ChainEntry;
}

/// Call a caller's callback, swallowing what it throws: the lifecycle reports on
/// the tx, and a failing listener must not stop it reaching a terminal state.
function quietly(callback: (() => void) | undefined): void {
  try {
    callback?.();
  } catch {
    // ignore
  }
}

export async function trackTxLifecycle(opts: TrackOpts): Promise<void> {
  const t = toastTx(opts.label, opts.txHash, opts.chain.explorerUrl);
  // Bound once so the narrowing survives into the callbacks below.
  const { escrow, ownCommitments } = opts;
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
    quietly(() => opts.onPhase?.(p));
  };
  const settle = (reason: string, fallback: TxPhase) => {
    if (settled) return;
    settled = true;
    clearTimeout(hardTimer);
    if (!emittedTerminal) phase(fallback);
    log.debug("settled", { reason, txHash: opts.txHash });
    quietly(opts.onSettled);
  };
  const hardTimer = setTimeout(() => {
    // The tx was broadcast and watching stopped. Reported, rather than leaving
    // the toast silent and the stepper mid-flight.
    t.timedOut();
    settle("hard-timeout", "unknown");
  }, LIFECYCLE_HARD_TIMEOUT_MS);
  const tick = () => quietly(opts.onProgress);

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
    phase("mined");
    tick();

    if (escrow !== undefined) {
      // The tx is already mined here, so an unobserved flush is not a failed
      // deposit. `unknown` is the correct terminal: watching has stopped, the
      // outcome was not observed, and the toast carries the explorer link. A sync
      // failing while waiting is the same unobserved outcome, not a revert.
      const wait = await opts.wallet
        .awaitDeposit(escrow, { timeoutMs: FLUSH_TIMEOUT_MS })
        .catch((e: unknown) => {
          log.warn("flush wait failed; outcome unobserved", e);
          return undefined;
        });
      if (wait?.status !== "seen") {
        t.timedOut();
        settle("flush-timeout", "unknown");
        return;
      }
      phase("flushed");
      tick();
      phase("settled");
      settle("ok", "settled");
      return;
    }

    if (ownCommitments && ownCommitments.length > 0) {
      // Best-effort: the pending overlay falls back to react-query polling.
      const wait = await opts.wallet
        .awaitCommitments(ownCommitments, { timeoutMs: SCANNER_CATCHUP_TIMEOUT_MS })
        .catch(() => undefined);
      if (wait?.status === "seen") {
        phase("settled");
        tick();
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
