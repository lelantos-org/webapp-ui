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
import type { PendingShape } from "@/features/pending-tx";
import type { WithAsset } from "../port";
import type { ShieldedKind } from "./tx-progress";

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
  /// Asset the B-note credits.
  assetOut: bigint;
  /// Value it will carry, as `swapCredit` sizes it. The tracker resolves this
  /// where the reads it needs already are, so this module stays the pure
  /// mapping it is for every other kind.
  bNoteValue: bigint;
  /// `wallet.balance(assetOut)` snapshotted BEFORE the post-tx sync runs, so a
  /// fast relayer flush doesn't inflate the watermark anchor.
  assetOutBaseline: bigint;
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
/// Watched by watermark rather than by commitment: the relayer flushes this
/// deposit asynchronously, so the lifecycle tracker never sees the note land.
function swapLegB(d: SwapLegBData): PendingShape[] {
  if (d.bNoteValue <= 0n) return [];
  return [
    {
      asset: d.assetOut,
      pendingIn: d.bNoteValue,
      outflow: 0n,
      // The watermark is the balance this note will actually produce, not
      // `baseline + 1`. Any unrelated inflow on `assetOut` — an inbound
      // transfer, a concurrent deposit — satisfied `+1` and dropped the
      // overlay while the swap was still settling.
      clearWhenBalanceAtLeast: d.assetOutBaseline + d.bNoteValue,
    },
  ];
}
