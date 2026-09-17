import type { DepositResult, SwapResult, TransferResult, WithdrawResult } from "@lelantos-org/sdk";
import type { OpKind } from "@/shared/domain/op-kind";
import type { PendingShape } from "./pending-store";

/// Caller-supplied data per op kind.
export type PendingContext =
  | { kind: "deposit"; result: DepositResult }
  | { kind: "transfer"; result: TransferResult; isSelfTransfer: boolean }
  | { kind: "withdraw"; result: WithdrawResult }
  | { kind: "withdrawEth"; result: WithdrawResult }
  | {
      kind: "swap";
      result: SwapResult;
      /// Omitted without a wallet, in which case only leg-A change is shown.
      legB?: SwapLegBData;
    };

export interface SwapLegBData {
  /// Asset the B-note credits.
  assetOut: bigint;
  /// Value it will carry: the quote's `credit`, which the proof binds.
  bNoteValue: bigint;
  /// Confirmed `assetOut` balance snapshotted before the post-tx sync, so a fast flush cannot inflate it.
  assetOutBaseline: bigint;
}

type Builder<K extends OpKind> = (ctx: Extract<PendingContext, { kind: K }>) => PendingShape[];

const builders: { [K in OpKind]: Builder<K> } = {
  deposit: ({ result: r }) =>
    shape(r.asset.id, r.ownCommitments.length > 0 ? r.amount.amount : 0n, 0n),
  transfer: ({ result: r, isSelfTransfer }) =>
    shape(
      r.asset.id,
      r.change + (isSelfTransfer ? r.amount.amount : 0n),
      isSelfTransfer ? 0n : r.amount.amount,
    ),
  withdraw: ({ result: r }) => shape(r.asset.id, r.change, r.gross.amount),
  withdrawEth: ({ result: r }) => shape(r.asset.id, r.change, r.gross.amount),
  swap: (ctx) => [
    ...shape(ctx.result.asset.id, ctx.result.change, ctx.result.gross.amount),
    ...(ctx.legB ? swapLegB(ctx.legB) : []),
  ],
};

/// The pending overlay entries for a settled mutation.
export function pendingShapesFor(ctx: PendingContext): PendingShape[] {
  const fn = builders[ctx.kind] as (c: PendingContext) => PendingShape[];
  return fn(ctx);
}

function shape(asset: bigint, pendingIn: bigint, outflow: bigint): PendingShape[] {
  if (pendingIn === 0n && outflow === 0n) return [];
  return [{ asset, pendingIn, outflow }];
}

/// Leg-2 B-note inflow, watched by balance watermark: there is no single commitment to await.
function swapLegB(d: SwapLegBData): PendingShape[] {
  if (d.bNoteValue <= 0n) return [];
  return [
    {
      asset: d.assetOut,
      pendingIn: d.bNoteValue,
      outflow: 0n,
      // The note's resulting balance, not `baseline + 1`, which any unrelated inflow would satisfy.
      clearWhenBalanceAtLeast: d.assetOutBaseline + d.bNoteValue,
    },
  ];
}
