// The vocabulary a tracked transaction is described in.
//
// Here rather than in `features/ops/sdk-adapter.ts`, which produces results,
// because both sides need it and only one of them can own it: the lifecycle and
// the pending overlay read it, and the ops port produces it. Owning it here keeps
// the dependency pointing one way — `ops` imports `tx`, never the reverse.

import type { TransactionResult } from "@lelantos-org/sdk";

/// Webapp-facing result type: the SDK's discriminated union over op kinds.
/// Switch on `kind` to read variant-specific fields; every variant names the
/// asset it moved (`asset.id`), which the pending overlay credits and the
/// lifecycle labels.
export type TxResult = TransactionResult;
