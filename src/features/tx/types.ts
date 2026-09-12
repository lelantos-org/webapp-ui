// The vocabulary a tracked transaction is described in.
//
// Here rather than in `features/ops/sdk-adapter.ts`, which tags results, because both
// sides need it and only one of them can own it: the lifecycle and the pending
// overlay read the asset tag, and the ops port produces it. Owning it here keeps
// the dependency pointing one way — `ops` imports `tx`, never the reverse.

import type { TransactionResult } from "@lelantos-org/sdk/wallet";

/// Tag any SDK result with the asset id the action operated on. The intersection
/// preserves the `kind` discriminator, so narrowing on `kind` still gates the
/// variant-specific fields.
///
/// SDK results do not carry the asset id, and the pending overlay and the
/// lifecycle both need it — the overlay to credit the right balance, the
/// lifecycle to label the toast.
export type WithAsset<R> = R & { asset: bigint };

/// Webapp-facing result type: a discriminated union over op kinds, plus the
/// asset tag. Switch on `kind` to read variant-specific fields.
export type TxResult = WithAsset<TransactionResult>;
