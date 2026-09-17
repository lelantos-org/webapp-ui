import type { TxOperation } from "@/shared/ui/tx-cards/TxSettledCard";

/// What a result says about its operation. Structural, so `operation` may be absent.
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

/// The operation a result describes: its tx hash, and its first commitment as the id.
export function pendingOpOf(result: OperationResult): PendingOp {
  return { txHash: result.txHash, opId: result.commitments[0] ?? result.txHash };
}

/// The settled card's operation row, or `undefined` unless the tx bundles several operations.
export function operationOf(result: OperationResult | undefined): TxOperation | undefined {
  const op = result?.operation;
  const commitment = result?.commitments[0];
  if (!op || op.count <= 1 || commitment === undefined) return undefined;
  return { index: op.index + 1, count: op.count, commitment };
}
