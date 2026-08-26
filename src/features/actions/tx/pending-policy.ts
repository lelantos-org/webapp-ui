// Per-op classification of an in-flight tx into the pending overlay entries
// rendered by `features/pending-tx`. A pure synchronous mapping: `useTxTracker`
// resolves any per-kind async data — chain reads, baseline snapshots — up front
// and threads the values in through `PendingContext`.

import type {
  DepositResult,
  SwapResult,
  TransferResult,
  WithdrawResult,
} from "@lelantos-org/sdk/wallet";
import type { PendingShape } from "@/features/pending-tx";
import type { WithAsset } from "../port";
import type { ShieldedKind } from "./tx-progress";

// Defined once, in the module that also maps a kind to its step list.
export type { ShieldedKind };

/// Caller-supplied data per kind, discriminated so each kind carries only its own
/// fields and the dispatch table always receives a fully shaped context.
export type PendingContext =
  | { kind: "deposit"; result: WithAsset<DepositResult> }
  | { kind: "transfer"; result: WithAsset<TransferResult>; isSelfTransfer: boolean }
  | { kind: "withdraw"; result: WithAsset<WithdrawResult> }
  | { kind: "withdrawEth"; result: WithAsset<WithdrawResult> }
  | {
      kind: "swap";
      result: WithAsset<SwapResult>;
      /// Optional leg-B data, omitted when no wallet is available, in which case
      /// only leg-A change appears in the overlay.
      legB?: SwapLegBData;
    };

export interface SwapLegBData {
  /// Asset the B-note credits.
  assetOut: bigint;
  /// Value it will carry, as sized by `swapCredit`. Resolved by the tracker,
  /// which already holds the reads it needs, keeping this module a pure mapping.
  bNoteValue: bigint;
  /// `wallet.balance(assetOut)` snapshotted before the post-tx sync runs, so a
  /// fast relayer flush cannot inflate the watermark anchor.
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
/// deposit asynchronously, so the lifecycle tracker never sees the note land.
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
