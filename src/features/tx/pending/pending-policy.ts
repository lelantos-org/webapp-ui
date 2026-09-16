// Per-op classification of an in-flight tx into the pending overlay entries
// held by `pending-store.ts`. A pure synchronous mapping: `useTxTracker`
// resolves any per-kind data — baseline snapshots — up front and threads the
// values in through `PendingContext`.

import type { DepositResult, SwapResult, TransferResult, WithdrawResult } from "@lelantos-org/sdk";
import type { OpKind } from "@/shared/domain/op-kind";
import type { PendingShape } from "./pending-store";

/// Caller-supplied data per kind, discriminated so each kind carries only its own
/// fields and the dispatch table always receives a fully shaped context.
export type PendingContext =
  | { kind: "deposit"; result: DepositResult }
  | { kind: "transfer"; result: TransferResult; isSelfTransfer: boolean }
  | { kind: "withdraw"; result: WithdrawResult }
  | { kind: "withdrawEth"; result: WithdrawResult }
  | {
      kind: "swap";
      result: SwapResult;
      /// Optional leg-B data, omitted when no wallet is available, in which case
      /// only leg-A change appears in the overlay.
      legB?: SwapLegBData;
    };

export interface SwapLegBData {
  /// Asset the B-note credits.
  assetOut: bigint;
  /// Value it will carry: the quote's `credit`, which the proof binds.
  bNoteValue: bigint;
  /// The confirmed balance of `assetOut` snapshotted before the post-tx sync
  /// runs, so a fast relayer flush cannot inflate the watermark anchor.
  assetOutBaseline: bigint;
}

type Builder<K extends OpKind> = (ctx: Extract<PendingContext, { kind: K }>) => PendingShape[];

const builders: { [K in OpKind]: Builder<K> } = {
  // A deposit to this wallet lands as one own note of `amount`; one to another
  // recipient produces no own commitment and nothing to await.
  deposit: ({ result: r }) =>
    shape(r.asset.id, r.ownCommitments.length > 0 ? r.amount.amount : 0n, 0n),
  // Change always comes back; the recipient's note is ours too on a self-transfer,
  // and then nothing leaves.
  transfer: ({ result: r, isSelfTransfer }) =>
    shape(
      r.asset.id,
      r.change + (isSelfTransfer ? r.amount.amount : 0n),
      isSelfTransfer ? 0n : r.amount.amount,
    ),
  // `gross` is the `publicOut` leaving the pool, the figure the balance drops by.
  withdraw: ({ result: r }) => shape(r.asset.id, r.change, r.gross.amount),
  withdrawEth: ({ result: r }) => shape(r.asset.id, r.change, r.gross.amount),
  swap: (ctx) => [
    ...shape(ctx.result.asset.id, ctx.result.change, ctx.result.gross.amount),
    ...(ctx.legB ? swapLegB(ctx.legB) : []),
  ],
};

/// Build the pending overlay entries for a settled mutation. Empty when the tx
/// produces no own-output or outflow worth surfacing.
export function pendingShapesFor(ctx: PendingContext): PendingShape[] {
  // Cast: TypeScript cannot see that `builders[ctx.kind]` is the builder matching
  // `ctx`'s discriminant. Sound at runtime.
  const fn = builders[ctx.kind] as (c: PendingContext) => PendingShape[];
  return fn(ctx);
}

function shape(asset: bigint, pendingIn: bigint, outflow: bigint): PendingShape[] {
  if (pendingIn === 0n && outflow === 0n) return [];
  return [{ asset, pendingIn, outflow }];
}

/// Leg-2 B-note inflow on `assetOut`.
///
/// Watched by watermark rather than by commitment: the relayer flushes this
/// deposit asynchronously, and exactly one of the credit and refund notes lands,
/// so there is no single commitment for the lifecycle tracker to await.
function swapLegB(d: SwapLegBData): PendingShape[] {
  if (d.bNoteValue <= 0n) return [];
  return [
    {
      asset: d.assetOut,
      pendingIn: d.bNoteValue,
      outflow: 0n,
      // The watermark is the balance this note will produce, not `baseline + 1`,
      // which any unrelated inflow on `assetOut` — an inbound transfer, a
      // concurrent deposit — would satisfy, dropping the overlay while the swap
      // was still settling.
      clearWhenBalanceAtLeast: d.assetOutBaseline + d.bNoteValue,
    },
  ];
}
