// Wires the post-submit lifecycle for any shielded mutation: refetch
// wallet-state, splice pending-tx overlay entries, drive the toast
// lifecycle, clear lifecycle-bound entries on settle.

import type { TransactionResult, WalletApi } from "@lelantos-org/sdk/wallet";
import { useCallback } from "react";
import { trackTxLifecycle } from "@/features/actions/lifecycle";
import { type PendingContext, pendingShapesFor } from "@/features/actions/pending-policy";
import { addPendingMany, clearPending } from "@/features/actions/pending-tx-store";
import type { TxPhase } from "@/features/actions/tx-progress";
import { useWallet } from "@/features/wallet";
import { useInvalidateWalletState } from "@/features/wallet/use-wallet-state";

/// Caller request — minus per-kind enrichment that the tracker can derive
/// itself (swap leg-B watermark anchor + chain reads).
export type TrackTxRequest =
  | Extract<PendingContext, { kind: "deposit" | "transfer" | "withdraw" | "withdrawEth" }>
  | {
      kind: "swap";
      result: Extract<PendingContext, { kind: "swap" }>["result"];
      swap: NonNullable<Extract<PendingContext, { kind: "swap" }>["legB"]>["swap"];
    };

export type TrackTxArgs = TrackTxRequest & {
  label: string;
  /// Forwarded to lifecycle.onPhase so post-submit phases (mined,
  /// flushed, settled, failed) advance the form's progress bar.
  onPhase?: (phase: TxPhase) => void;
};

export function useTxTracker(): (args: TrackTxArgs) => Promise<void> {
  const invalidate = useInvalidateWalletState();
  const { wallet } = useWallet();
  return useCallback(
    async (args) => {
      // Per-kind pre-tx capture. Only swap needs it (assetOut baseline +
      // fee/scale). Snapshot BEFORE invalidate so post-tx sync that lands
      // the B-note can't inflate the watermark anchor.
      const ctx = await prepareCtx(args, wallet);

      // Refetch so balance reflects local markSpent before the pending
      // overlay is spliced (avoids a one-frame flicker).
      await invalidate();

      addPendingMany(args.result.txHash, pendingShapesFor(ctx));

      if (!wallet) return;
      void trackTxLifecycle({
        wallet,
        label: args.label,
        txHash: args.result.txHash,
        intentId: extractIntentId(args.result),
        ownCommitments: args.result.ownCommitments,
        onProgress: () => void invalidate(),
        onSettled: () => clearPending(args.result.txHash),
        onPhase: args.onPhase,
      });
    },
    [invalidate, wallet],
  );
}

async function prepareCtx(
  args: TrackTxRequest,
  wallet: WalletApi | undefined,
): Promise<PendingContext> {
  if (args.kind !== "swap") return args;
  if (!wallet) return { kind: "swap", result: args.result };
  const [entryOut, feeBps] = await Promise.all([
    wallet.chain.fetchAsset(args.swap.assetOut),
    wallet.chain.fetchFeeBps(),
  ]);
  return {
    kind: "swap",
    result: args.result,
    legB: {
      swap: args.swap,
      assetOutBaseline: wallet.balance(args.swap.assetOut),
      scaleOut: entryOut.scale,
      feeBps,
    },
  };
}

/// Only deposit + swap surface a relayer intent id. Lifecycle uses it to
/// wait for the SSE flush event before declaring the tx settled.
function extractIntentId(r: TransactionResult): bigint | undefined {
  return r.kind === "deposit" || r.kind === "swap" ? r.intentId : undefined;
}
