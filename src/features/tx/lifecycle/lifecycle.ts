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
  /// Deposit only: after mining, wait for the escrowed note to be flushed and scanned.
  escrow?: DepositEscrow | undefined;
  /// Own commitments that must reach the local note store before the balance is settled.
  ownCommitments?: Hex32[];
  /// Called at each state that warrants a wallet refresh. Errors are swallowed.
  onProgress?: () => void;
  /// Called exactly once, at a terminal state.
  onSettled?: () => void;
  /// Phase signal for steppers: mined, flushed, settled, failed. Errors are swallowed.
  onPhase?: ((phase: TxPhase) => void) | undefined;
  /// Chain the tx was submitted on, so the lifecycle survives a chain switch.
  chain: ChainEntry;
}

/// Call a listener, swallowing what it throws so the lifecycle still settles.
function quietly(callback: (() => void) | undefined): void {
  try {
    callback?.();
  } catch {
    // ignore
  }
}

/// Drive a broadcast tx's toast and phases to a terminal state. Fire-and-forget.
export async function trackTxLifecycle(opts: TrackOpts): Promise<void> {
  const t = toastTx(opts.label, opts.txHash, opts.chain.explorerUrl);
  const { escrow, ownCommitments } = opts;
  let settled = false;
  // Every exit must emit a terminal phase, or the stepper strands mid-list.
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
    t.timedOut();
    settle("hard-timeout", "unknown");
  }, LIFECYCLE_HARD_TIMEOUT_MS);
  const tick = () => quietly(opts.onProgress);

  try {
    if (!opts.wallet.chain.waitTxReceipt) {
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
      // Already mined, so an unobserved flush is `unknown`, not a failed deposit.
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
      const wait = await opts.wallet
        .awaitCommitments(ownCommitments, { timeoutMs: SCANNER_CATCHUP_TIMEOUT_MS })
        .catch(() => undefined);
      if (wait?.status === "seen") {
        phase("settled");
        tick();
      }
    }
    settle("ok", "settled");
  } catch (err) {
    t.failed(err);
    phase("failed");
    settle("error", "failed");
  }
}
