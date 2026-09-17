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

/// Caller request, before the tracker adds the swap leg-B baseline.
export type TrackTxRequest =
  | Extract<PendingContext, { kind: Exclude<OpKind, "swap"> }>
  | {
      kind: "swap";
      result: Extract<PendingContext, { kind: "swap" }>["result"];
      swap: SwapCall;
    };

export type TrackTxArgs = TrackTxRequest & {
  label: string;
  /// Forwarded to the lifecycle, so post-submit phases advance the form's stepper.
  onPhase?: (phase: TxPhase) => void;
};

/// Post-submit bookkeeping for a broadcast tx. Never rejects: from `onSuccess`, a rejection marks a sent tx failed.
export function useTxTracker(): (args: TrackTxArgs) => Promise<void> {
  const invalidate = useInvalidateWalletState();
  const wallet = useWalletInstance();
  const chain = useActiveChain();
  return useCallback(
    async (args) => {
      // Before the invalidate, so a post-tx sync cannot inflate the swap baseline.
      const ctx = prepareCtx(args, wallet);

      await invalidate().catch((e: unknown) => log.warn("post-submit invalidate failed", e));

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

/// Add the swap leg-B watermark; without a wallet, degrade to no leg-B overlay.
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
        assetOutBaseline: wallet.state().balances.get(assetOut) ?? 0n,
      },
    };
  } catch (e) {
    log.warn("swap leg-B context unavailable; overlay will omit it", e);
    return { kind: "swap", result: args.result };
  }
}

function escrowOf(r: TransactionResult): DepositEscrow | undefined {
  return r.kind === "deposit" ? r.escrow : undefined;
}
