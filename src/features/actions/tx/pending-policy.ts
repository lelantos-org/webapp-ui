// Per-op classification of an in-flight tx into pending overlay entries
// rendered by `features/pending-tx`. Pure synchronous mapping —
// `useTxTracker` resolves any per-kind async data (chain reads, baseline
// snapshots) up-front and threads the values into `PendingContext`.

import { BPS_DENOMINATOR } from "@lelantos-org/sdk/core";
import type {
  DepositResult,
  SwapResult,
  TransferResult,
  WithdrawResult,
} from "@lelantos-org/sdk/wallet";
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

/// Leg-2 B-note inflow on `assetOut`. Mirrors SDK's bValue derivation:
/// `minOut · BPS / (scaleOut · (BPS + feeBps))`.
function swapLegB(d: SwapLegBData): PendingShape[] {
  const denom = d.scaleOut * (BPS_DENOMINATOR + d.feeBps);
  if (denom === 0n) return [];
  const bValue = (d.swap.quote.minOut * BPS_DENOMINATOR) / denom;
  if (bValue <= 0n) return [];
  return [
    {
      asset: d.swap.assetOut,
      pendingIn: bValue,
      outflow: 0n,
      // Floor at baseline+1: a pre-existing balance equal to baseline
      // must not trigger an immediate self-clear before any sync runs.
      clearWhenBalanceAtLeast: d.assetOutBaseline + 1n,
    },
  ];
}
