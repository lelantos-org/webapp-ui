// Drives the broadcast → mined → flushed toast lifecycle for a tx.
// Fire-and-forget: callers `void trackTxLifecycle(...)` and let it
// settle in the background.

import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { env } from "@/config/env";
import type { TxPhase } from "@/features/actions/tx-progress";
import { awaitFlush, preopenIntentStream } from "@/features/relayer/intent-stream";
import { toastTx } from "@/shared/lib/toast";

const FLUSH_TIMEOUT_MS = 5 * 60_000;
const SCANNER_CATCHUP_TIMEOUT_MS = 60_000;
const LIFECYCLE_HARD_TIMEOUT_MS = 6 * 60_000;

export interface TrackOpts {
  wallet: WalletApi;
  label: string;
  txHash: string;
  /// Deposit-only. When present, mining is followed by a wait for the
  /// relayer's flushBatch to clear this id before scanning for own outputs.
  intentId?: bigint;
  /// Commitments produced for this wallet that must land in the local note
  /// store before the balance is declared "settled". Empty for transfers
  /// where neither output goes to self.
  ownCommitments?: string[];
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
}

export async function trackTxLifecycle(opts: TrackOpts): Promise<void> {
  const t = toastTx(opts.label, opts.txHash);
  // Open the SSE source before waiting for receipt so a fast relayer
  // can't publish flush before the listener is attached.
  if (opts.intentId !== undefined) preopenIntentStream(env.chainId);
  let settled = false;
  const settle = (_reason: string) => {
    if (settled) return;
    settled = true;
    clearTimeout(hardTimer);
    try {
      opts.onSettled?.();
    } catch {
      // ignore
    }
  };
  const hardTimer = setTimeout(() => settle("hard-timeout"), LIFECYCLE_HARD_TIMEOUT_MS);
  const tick = () => {
    try {
      opts.onProgress?.();
    } catch {
      // ignore
    }
  };
  const phase = (p: TxPhase) => {
    try {
      opts.onPhase?.(p);
    } catch {
      // ignore
    }
  };

  try {
    if (!opts.wallet.chain.waitTxReceipt) {
      settle("no-receipt-adapter");
      return;
    }
    const receipt = await opts.wallet.chain.waitTxReceipt(opts.txHash);
    if (receipt.status === 0) {
      t.failed(new Error(`tx reverted at block ${receipt.blockNumber}`));
      phase("failed");
      settle("reverted");
      return;
    }
    t.mined(receipt.blockNumber);
    phase("mined");
    tick();

    if (opts.intentId !== undefined) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FLUSH_TIMEOUT_MS);
      try {
        const flush = await awaitFlush(env.chainId, opts.intentId, ctrl.signal);
        t.flushed(flush.blockNumber);
        phase("flushed");
        tick();
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          t.timedOut();
        } else {
          t.failed(err);
        }
        phase("failed");
        settle("flush-failed");
        return;
      } finally {
        clearTimeout(timer);
      }
    }

    if (opts.ownCommitments && opts.ownCommitments.length > 0) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SCANNER_CATCHUP_TIMEOUT_MS);
      try {
        await opts.wallet.awaitCommitments(opts.ownCommitments, { signal: ctrl.signal });
        phase("settled");
        tick();
      } catch {
        // Best-effort — pending overlay falls back to react-query polling.
      } finally {
        clearTimeout(timer);
      }
    }
    settle("ok");
  } catch (err) {
    t.failed(err);
    phase("failed");
    settle("error");
  }
}
