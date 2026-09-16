// Protocol fee math, over the SDK's `applyFee`. Truncating integer division
// mirrors `MASP._takeFee` on-chain.

import { circuitAmount, type TokenAmount } from "@lelantos-org/sdk";
import { applyFee, BPS_DENOMINATOR, RAY, toTokenUnits } from "@lelantos-org/sdk/protocol";
import type { FeeLeg } from "@/shared/domain/op-kind";
import { asBaseUnits } from "@/shared/domain/units";

/// The basis-point denominator `applyFee` — and `MASP._takeFee` — divide by.
///
/// Re-exported from the SDK rather than written as `10_000n` here: it is a
/// property of the contract, so a local copy could silently diverge. Same
/// reasoning as the SDK's `PUBLIC_IN_MAX`.
export { BPS_DENOMINATOR };

export interface FeeBreakdown {
  /// Asset scale times the user amount, in token base units. For a deposit this
  /// is what the contract escrows; for a withdraw it is the gross unshield
  /// amount.
  inAmt: TokenAmount;
  /// Fee in token base units.
  fee: TokenAmount;
  /// User's net cash delta in base units:
  ///   deposit  → `inAmt + fee` (payer is debited, fee added on top)
  ///   withdraw → `inAmt - fee` (recipient is credited, fee deducted)
  total: TokenAmount;
  /// The rate applied, in bps: this asset's rate for this leg (there is no
  /// pool-wide rate).
  feeBps: bigint;
  leg: FeeLeg;
}

export interface FeeInputs {
  /// Amount in circuit units. Unbranded: `feeBreakdown` brands it itself, and
  /// refuses a negative at runtime.
  amount: bigint;
  /// Circuit-units → base-units multiplier for the asset.
  scale: bigint;
  feeBps: bigint;
  leg: FeeLeg;
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
export function feeBreakdown({ amount, scale, feeBps, leg, index = RAY }: FeeInputs): FeeBreakdown {
  // The SDK's conversion, at the rounding the leg requires: **up** into the
  // pool, **down** out of it, so dust always accrues to the remaining holders
  // rather than to whoever is transacting. That asymmetry is the SDK's to own —
  // re-deriving it here is how the two end up disagreeing.
  const inAmt = toTokenUnits(circuitAmount(amount), scale, {
    index,
    round: leg === "deposit" ? "up" : "down",
  });
  // A fee on base units, and so base units; the withdraw total cannot go
  // negative, the fee being a fraction of `inAmt`.
  const fee = asBaseUnits(applyFee(inAmt, feeBps));
  return {
    inAmt,
    fee,
    total: asBaseUnits(leg === "deposit" ? inAmt + fee : inAmt - fee),
    feeBps,
    leg,
  };
}
