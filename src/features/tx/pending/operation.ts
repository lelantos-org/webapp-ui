// What names one operation within a transaction.
//
// A relayer bundles several operations into one transaction, so the tx hash is
// not an operation's identity: two of this wallet's own spends can share one.
// An operation is named instead by its first output commitment, which no other
// operation can produce. The pending overlay keys by it, and the settled card
// shows it beside the hash.

import type { TxOperation } from "@/shared/ui/tx-cards/TxSettledCard";

/// What a result says about the operation it describes.
///
/// Typed structurally rather than as the SDK's `TransactionResult`: `operation`
/// arrives with the SDK release that locates bundled operations, and this reads
/// it wherever it is present without depending on that release's types.
export interface OperationResult {
  txHash: string;
  commitments: readonly string[];
  operation?: { index: number; count: number } | undefined;
}

/// The operation a pending entry belongs to. See `pendingOpOf`.
export interface PendingOp {
  /// Originating tx hash. Several operations may share one when bundled.
  txHash: string;
  /// The operation's first output commitment — unique to it, unlike the hash.
  opId: string;
}

/// The operation a result describes: its tx hash, and its first commitment as
/// the id. Falls back to the hash for a result with no outputs, which no spend
/// or deposit produces.
export function pendingOpOf(result: OperationResult): PendingOp {
  return { txHash: result.txHash, opId: result.commitments[0] ?? result.txHash };
}

/// The settled card's operation row, for an operation that shares its
/// transaction with others. `undefined` for a lone operation, an unlocated one,
/// or no result yet — the transaction row already says everything.
export function operationOf(result: OperationResult | undefined): TxOperation | undefined {
  const op = result?.operation;
  const commitment = result?.commitments[0];
  if (!op || op.count <= 1 || commitment === undefined) return undefined;
  return { index: op.index + 1, count: op.count, commitment };
}
