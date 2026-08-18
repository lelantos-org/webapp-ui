// Per-op classification of an in-flight tx into pending overlay entries
// rendered by `features/pending-tx`. Pure synchronous mapping —
// `useTxTracker` resolves any per-kind async data (chain reads, baseline
// snapshots) up-front and threads the values into `PendingContext`.

import type {
  DepositResult,
  SwapResult,
  TransferResult,
  WithdrawResult,
} from "@lelantos-org/sdk/wallet";
import { sizeBNote } from "@lelantos-org/sdk/wallet";
import type { SwapCall, WithAsset } from "@/features/actions/port";
import type { ShieldedKind } from "@/features/actions/tx/tx-progress";
import type { PendingShape } from "@/features/pending-tx/store";

// One definition, in the module that also maps a kind to its step list.
export type { ShieldedKind };

/// Caller-supplied data per kind. Discriminated so each kind carries only
/// its own fields; TS guarantees the dispatch table receives a fully
/// shaped context.
export type PendingContext =
  | { kind: "deposit"; result: WithAsset<DepositResult> }
  | { kind: "transfer"; result: WithAsset<TransferResult>; isSelfTransfer: boolean }
  | { kind: "withdraw"; result: WithAsset<WithdrawResult> }
  | { kind: "withdrawEth"; result: WithAsset<WithdrawResult> }
  | {
      kind: "swap";
      result: WithAsset<SwapResult>;
      /// Optional leg-B data. Omitted when no wallet is available; in that
      /// case only leg-A change shows up in the overlay.
      legB?: SwapLegBData;
    };

export interface SwapLegBData {
  swap: SwapCall;
  /// `wallet.balance(swap.assetOut)` snapshotted BEFORE the post-tx sync
  /// runs, so a fast relayer flush doesn't inflate the watermark anchor.
  assetOutBaseline: bigint;
  scaleOut: bigint;
  feeBps: bigint;
}

type Builder<K extends ShieldedKind> = (
  ctx: Extract<PendingContext, { kind: K }>,
) => PendingShape[];

const builders: { [K in ShieldedKind]: Builder<K> } = {
  deposit: (ctx) => shape(ctx.result.asset, ctx.result.ownInflow, 0n),
  transfer: (ctx) =>
    shape(ctx.result.asset, ctx.result.ownInflow, ctx.isSelfTransfer ? 0n : ctx.result.sent),
  withdraw: (ctx) => shape(ctx.result.asset, ctx.result.ownInflow, ctx.result.sent),
  withdrawEth: (ctx) => shape(ctx.result.asset, ctx.result.ownInflow, ctx.result.sent),
  swap: (ctx) => [
    ...shape(ctx.result.asset, ctx.result.ownInflow, ctx.result.sent),
    ...(ctx.legB ? swapLegB(ctx.legB) : []),
  ],
};

/// Build the list of pending overlay entries for a settled mutation.
/// Empty when the tx produces no own-output / outflow worth surfacing.
export function pendingShapesFor(ctx: PendingContext): PendingShape[] {
  // Cast: TS can't see that `builders[ctx.kind]` is the matching builder
  // for `ctx`'s discriminant. Sound at runtime.
  const fn = builders[ctx.kind] as (c: PendingContext) => PendingShape[];
  return fn(ctx);
}

function shape(asset: bigint, pendingIn: bigint, outflow: bigint): PendingShape[] {
  if (pendingIn === 0n && outflow === 0n) return [];
  return [{ asset, pendingIn, outflow }];
}

/// Leg-2 B-note inflow on `assetOut`.
///
/// `sizeBNote` is the SDK's own sizing — the same call `executeSwap` makes to
/// set the deposit leg's `publicIn` — so this is exactly what lands in the
/// wallet. The closed form this used to inline is only the lower bound that
/// sizing starts from, and under-reports whenever the division is inexact.
function swapLegB(d: SwapLegBData): PendingShape[] {
  if (d.scaleOut <= 0n) return [];
  const bValue = sizeBNote(d.swap.quote.minOut, d.scaleOut, d.feeBps);
  if (bValue <= 0n) return [];
  return [
    {
      asset: d.swap.assetOut,
      pendingIn: bValue,
      outflow: 0n,
      // The watermark is the balance this note will actually produce, not
      // `baseline + 1`. Any unrelated inflow on `assetOut` — an inbound
      // transfer, a concurrent deposit — satisfied `+1` and dropped the
      // overlay while the swap was still settling.
      clearWhenBalanceAtLeast: d.assetOutBaseline + bValue,
    },
  ];
}
