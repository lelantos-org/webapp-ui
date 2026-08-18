// Wires the post-submit lifecycle for any shielded mutation: refetch
// wallet-state, splice pending-tx overlay entries, drive the toast
// lifecycle, clear lifecycle-bound entries on settle.

import type { TransactionResult, WalletApi } from "@lelantos-org/sdk/wallet";
import { useCallback } from "react";
import { trackTxLifecycle } from "@/features/actions/tx/lifecycle";
import { type PendingContext, pendingShapesFor } from "@/features/actions/tx/pending-policy";
import type { TxPhase } from "@/features/actions/tx/tx-progress";
import { fetchAssetEntry } from "@/features/assets/asset-entry";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { addPendingMany, clearPending } from "@/features/pending-tx/store";
import { useWallet } from "@/features/wallet";
import { useInvalidateWalletState } from "@/features/wallet/use-wallet-state";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("tx:tracker");

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

/// Post-submit bookkeeping for a broadcast tx.
///
/// Never rejects. This runs from a mutation's `onSuccess`, *after* the tx is
/// already on its way, so a failure here says nothing about the transaction —
/// but react-query awaits whatever `onSuccess` returns inside its own `try` and
/// routes a rejection to `onError`. A single flaky `fetchFeeBps` therefore used
/// to turn a perfectly good swap into a red stepper, a "swap failed" toast, no
/// pending overlay, no explorer link and no lifecycle watch at all, while the
/// tx settled on chain regardless. Everything here degrades instead.
export function useTxTracker(): (args: TrackTxArgs) => Promise<void> {
  const invalidate = useInvalidateWalletState();
  const { wallet } = useWallet();
  const chain = useActiveChain();
  return useCallback(
    async (args) => {
      // Per-kind pre-tx capture. Only swap needs it (assetOut baseline +
      // fee/scale). Snapshot BEFORE invalidate so post-tx sync that lands
      // the B-note can't inflate the watermark anchor.
      const ctx = await prepareCtx(args, wallet);

      // Refetch so balance reflects local markSpent before the pending
      // overlay is spliced (avoids a one-frame flicker). A failed refetch is
      // cosmetic — the poll picks it up — and must not skip the steps below.
      await invalidate().catch((e: unknown) => log.warn("post-submit invalidate failed", e));

      addPendingMany(chain.chainId, args.result.txHash, pendingShapesFor(ctx));

      if (!wallet) return;
      void trackTxLifecycle({
        wallet,
        chain,
        label: args.label,
        txHash: args.result.txHash,
        depositId: extractDepositId(args.result),
        ownCommitments: args.result.ownCommitments,
        onProgress: () => void invalidate(),
        onSettled: () => clearPending(chain.chainId, args.result.txHash),
        onPhase: args.onPhase,
      });
    },
    [invalidate, wallet, chain],
  );
}

/// Enrich the pending context with what only a chain read can supply.
///
/// Degrades to the `legB`-less shape — the same one used when there is no
/// wallet — rather than propagating. Losing `legB` costs the swap its
/// leg-2 "settling" overlay; propagating cost the user a tx reported as failed.
async function prepareCtx(
  args: TrackTxRequest,
  wallet: WalletApi | undefined,
): Promise<PendingContext> {
  if (args.kind !== "swap") return args;
  if (!wallet) return { kind: "swap", result: args.result };
  try {
    const [entryOut, feeBps] = await Promise.all([
      fetchAssetEntry(wallet, args.swap.assetOut),
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
  } catch (e) {
    log.warn("swap leg-B context unavailable; overlay will omit it", e);
    return { kind: "swap", result: args.result };
  }
}

/// Only deposit + swap surface an on-chain deposit id — the same value the
/// relayer publishes as `deposit_id`. Lifecycle uses it to wait for the SSE
/// flush event before declaring the tx settled.
function extractDepositId(r: TransactionResult): bigint | undefined {
  return r.kind === "deposit" || r.kind === "swap" ? r.depositId : undefined;
}
