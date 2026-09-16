// Wires the post-submit lifecycle for any shielded mutation: refetch
// wallet-state, splice pending-tx overlay entries, drive the toast lifecycle,
// and clear lifecycle-bound entries on settle.

import type { DepositEscrow, TransactionResult, WalletApi } from "@lelantos-org/sdk";
import { useCallback } from "react";
import { useActiveChain } from "@/features/chain";
import {
  addPendingMany,
  clearPending,
  type PendingContext,
  pendingOpOf,
  pendingShapesFor,
  type TxPhase,
  trackTxLifecycle,
} from "@/features/tx";
import { useInvalidateWalletState, useWalletInstance } from "@/features/wallet";
import type { OpKind } from "@/shared/domain/op-kind";
import { createLogger } from "@/shared/lib/logger";
import type { SwapCall } from "./sdk-adapter";

const log = createLogger("tx:tracker");

/// Caller request, without the per-kind enrichment the tracker derives itself:
/// the swap leg-B watermark anchor.
export type TrackTxRequest =
  | Extract<PendingContext, { kind: Exclude<OpKind, "swap"> }>
  | {
      kind: "swap";
      result: Extract<PendingContext, { kind: "swap" }>["result"];
      swap: SwapCall;
    };

export type TrackTxArgs = TrackTxRequest & {
  label: string;
  /// Forwarded to `lifecycle.onPhase`, so the post-submit phases — mined,
  /// flushed, settled, failed — advance the form's progress bar.
  onPhase?: (phase: TxPhase) => void;
};

/// Post-submit bookkeeping for a broadcast tx.
///
/// Never rejects. This runs from a mutation's `onSuccess`, after the tx is
/// already on its way, so a failure here says nothing about the transaction —
/// yet react-query awaits whatever `onSuccess` returns inside its own `try` and
/// routes a rejection to `onError`, turning a successful swap into a red stepper,
/// a "swap failed" toast, no pending overlay, no explorer link and no lifecycle
/// watch. Every step here degrades instead.
export function useTxTracker(): (args: TrackTxArgs) => Promise<void> {
  const invalidate = useInvalidateWalletState();
  const wallet = useWalletInstance();
  const chain = useActiveChain();
  return useCallback(
    async (args) => {
      // Per-kind pre-tx capture. Only swap needs it: the `assetOut` baseline the
      // B-note is measured from. Snapshotted before the invalidate, so a post-tx
      // sync landing the B-note cannot inflate the anchor.
      const ctx = prepareCtx(args, wallet);

      // Refetch so the balance reflects the spent notes before the pending
      // overlay is spliced, avoiding a one-frame flicker. A failed refetch is
      // cosmetic — the poll picks it up — and must not skip the steps below.
      await invalidate().catch((e: unknown) => log.warn("post-submit invalidate failed", e));

      // Keyed by operation: a bundled tx can carry two of this wallet's own.
      const op = pendingOpOf(args.result);
      addPendingMany(chain.chainId, op, pendingShapesFor(ctx));

      if (!wallet) return;
      void trackTxLifecycle({
        wallet,
        chain,
        label: args.label,
        txHash: args.result.txHash,
        escrow: escrowOf(args.result),
        ownCommitments: args.result.ownCommitments,
        onProgress: () => void invalidate(),
        onSettled: () => clearPending(chain.chainId, op.opId),
        onPhase: args.onPhase,
      });
    },
    [invalidate, wallet, chain],
  );
}

/// Enrich the pending context with the leg-B watermark.
///
/// The B-note's value is the quote's `credit`, which the proof binds, so no read
/// is needed to size it; only the baseline comes from the wallet. Degrades to the
/// `legB`-less shape without a wallet, costing the swap its leg-2 settling
/// overlay rather than reporting a successful tx as failed.
function prepareCtx(args: TrackTxRequest, wallet: WalletApi | undefined): PendingContext {
  if (args.kind !== "swap") return args;
  if (!wallet) return { kind: "swap", result: args.result };
  try {
    const { quote } = args.swap;
    const assetOut = quote.assetOut.id;
    return {
      kind: "swap",
      result: args.result,
      legB: {
        assetOut,
        bNoteValue: quote.credit.amount,
        // The same figure the overlay is later pruned against: the confirmed
        // unspent total the wallet's state reports.
        assetOutBaseline: wallet.state().balances.get(assetOut) ?? 0n,
      },
    };
  } catch (e) {
    log.warn("swap leg-B context unavailable; overlay will omit it", e);
    return { kind: "swap", result: args.result };
  }
}

/// Only a deposit escrows. The lifecycle awaits the escrowed note's commitment,
/// which lands once the relayer has flushed it and this wallet has scanned it.
function escrowOf(r: TransactionResult): DepositEscrow | undefined {
  return r.kind === "deposit" ? r.escrow : undefined;
}
