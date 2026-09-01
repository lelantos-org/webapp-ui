// Protocol fee math, over the SDK's `applyFee`. Truncating integer division
// mirrors `MASP._takeFee` on-chain.

import {
  applyFee,
  BPS_DENOMINATOR,
  circuitAmount,
  RAY,
  toTokenUnits,
} from "@lelantos-org/sdk/core";

/// The basis-point denominator `applyFee` — and `MASP._takeFee` — divide by.
///
/// Re-exported from the SDK rather than written as `10_000n` here: it is a
/// property of the contract, so a local copy could silently diverge. Same
/// reasoning as `PUBLIC_IN_MAX` in `format`.
export { BPS_DENOMINATOR };

export type FeeMode = "deposit" | "withdraw";

export interface FeeBreakdown {
  /// Asset scale times the user amount, in token base units. For a deposit this
  /// is what the contract escrows; for a withdraw it is the gross unshield
  /// amount.
  inAmt: bigint;
  /// Fee in token base units.
  fee: bigint;
  /// User's net cash delta in base units:
  ///   deposit  → `inAmt + fee` (payer is debited, fee added on top)
  ///   withdraw → `inAmt - fee` (recipient is credited, fee deducted)
  total: bigint;
  /// The rate applied, in bps — the asset's rate for this leg. Per-asset and
  /// per-leg since contracts 0.5.0; there is no pool-wide rate.
  feeBps: bigint;
  mode: FeeMode;
}

export interface FeeInputs {
  /// Amount in circuit units.
  amount: bigint;
  /// Circuit-units → base-units multiplier for the asset.
  scale: bigint;
  feeBps: bigint;
  mode: FeeMode;
  /// Yield index, RAY-scaled. Defaults to `RAY`, which is the identity and
  /// leaves a plain asset's arithmetic exactly as it was.
  index?: bigint;
}

/// What a leg costs or yields, in token base units.
///
/// **An estimate, not the charge.** For a yield asset the pool converts with its
/// exact `gross / supply`, and the index this uses is floored where the relayer
/// reports it; the authoritative figure is computed inside the SDK, which signs
/// a ceiling over it. This drives what the UI shows and what the "max" button
/// offers, so a deposit rounds **up** — over-stating the cost keeps the max from
/// proposing an amount the payer cannot actually afford — and a withdraw rounds
/// **down**, so neither direction flatters the user into a failing transaction.
export function feeBreakdown({
  amount,
  scale,
  feeBps,
  mode,
  index = RAY,
}: FeeInputs): FeeBreakdown {
  // The SDK's conversion, at the rounding the leg requires: **up** into the
  // pool, **down** out of it, so dust always accrues to the remaining holders
  // rather than to whoever is transacting. That asymmetry is the SDK's to own —
  // re-deriving it here is how the two end up disagreeing.
  const inAmt = toTokenUnits(circuitAmount(amount), scale, {
    index,
    round: mode === "deposit" ? "up" : "down",
  });
  const fee = applyFee(inAmt, feeBps);
  return {
    inAmt,
    fee,
    total: mode === "deposit" ? inAmt + fee : inAmt - fee,
    feeBps,
    mode,
  };
}
