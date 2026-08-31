// Wires the post-submit lifecycle for any shielded mutation: refetch
// wallet-state, splice pending-tx overlay entries, drive the toast lifecycle,
// and clear lifecycle-bound entries on settle.

import type { TransactionResult, WalletApi } from "@lelantos-org/sdk/wallet";
import { useCallback } from "react";
import { fetchAssetEntry } from "@/features/assets";
import { useActiveChain } from "@/features/chain";
import { addPendingMany, clearPending } from "@/features/pending-tx";
import { useInvalidateWalletState, useWallet } from "@/features/wallet";
import { createLogger } from "@/shared/lib/logger";
import type { SwapCall } from "../port";
import { swapCredit } from "../swap-credit";
import { type FeeQuoteResult, feeOptionFor } from "../use-fee-quote";
import { trackTxLifecycle } from "./lifecycle";
import { type PendingContext, pendingShapesFor } from "./pending-policy";
import type { TxPhase } from "./tx-progress";

const log = createLogger("tx:tracker");

/// Caller request, without the per-kind enrichment the tracker derives itself:
/// the swap leg-B watermark anchor and its chain reads.
export type TrackTxRequest =
  | Extract<PendingContext, { kind: "deposit" | "transfer" | "withdraw" | "withdrawEth" }>
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
/// routes a rejection to `onError`. A single failed `fetchFeeBps` would then
/// turn a successful swap into a red stepper, a "swap failed" toast, no pending
/// overlay, no explorer link and no lifecycle watch. Every step here degrades
/// instead.
export function useTxTracker(): (args: TrackTxArgs) => Promise<void> {
  const invalidate = useInvalidateWalletState();
  const { wallet } = useWallet();
  const chain = useActiveChain();
  return useCallback(
    async (args) => {
      // Per-kind pre-tx capture. Only swap needs it: the B-note's size and the
      // `assetOut` baseline it is measured from. Snapshotted before the
      // invalidate, so a post-tx sync landing the B-note cannot inflate the
      // anchor.
      const ctx = await prepareCtx(args, wallet);

      // Refetch so the balance reflects the local `markSpent` before the pending
      // overlay is spliced, avoiding a one-frame flicker. A failed refetch is
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
/// Degrades to the `legB`-less shape, the same one used when there is no wallet,
/// rather than propagating. Losing `legB` costs the swap its leg-2 settling
/// overlay; propagating would report a successful tx as failed.
async function prepareCtx(
  args: TrackTxRequest,
  wallet: WalletApi | undefined,
): Promise<PendingContext> {
  if (args.kind !== "swap") return args;
  if (!wallet) return { kind: "swap", result: args.result };
  try {
    const { assetOut, quote } = args.swap;
    const [entryOut, depositFees] = await Promise.all([
      fetchAssetEntry(wallet, assetOut),
      // Priced as a deposit, because leg 2 is one: the relayer's flush note is
      // minted in the deposited asset, so this is the same quote
      // `resolveDepositFee` read when `executeSwap` sized the B-note.
      wallet.quoteFee({ kind: "deposit" }),
    ]);
    return {
      kind: "swap",
      result: args.result,
      legB: {
        assetOut,
        bNoteValue: swapCredit({
          minOut: quote.minOut,
          scaleOut: entryOut.scale,
          // Same leg, same reason: the B-note is a deposit of the out asset, so
          // that asset's deposit rate is what the watermark is computed at.
          // Carried on the entry since contracts 0.5.0, so it costs no extra
          // round trip.
          feeBps: entryOut.depositBps,
          depositFee: depositFeeFor(depositFees, assetOut),
        }),
        assetOutBaseline: wallet.balance(assetOut),
      },
    };
  } catch (e) {
    log.warn("swap leg-B context unavailable; overlay will omit it", e);
    return { kind: "swap", result: args.result };
  }
}

/// What the relayer takes to flush a deposit of `asset`, in circuit units.
///
/// Zero when the relayer quoted nothing for this asset: either the chain
/// subsidises deposits or it takes no fee, both of which `executeSwap` resolves
/// to a zero-value note. A quoted but unpayable fee cannot reach here, since
/// `resolveDepositFee` throws on it before the swap is submitted.
function depositFeeFor(quote: FeeQuoteResult, asset: bigint): bigint {
  return feeOptionFor(quote, asset)?.amount ?? 0n;
}

/// Only deposit and swap carry an on-chain deposit id, the same value the relayer
/// publishes as `deposit_id`. The lifecycle uses it to wait for the SSE flush
/// event before declaring the tx settled.
function extractDepositId(r: TransactionResult): bigint | undefined {
  return r.kind === "deposit" || r.kind === "swap" ? r.depositId : undefined;
}
