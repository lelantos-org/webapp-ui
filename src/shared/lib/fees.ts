// Protocol fee math, over the SDK's `applyFee`. Truncating integer division
// mirrors `MASP._takeFee` on-chain.

import { applyFee, BPS_DENOMINATOR } from "@lelantos-org/sdk/core";

/// The basis-point denominator `applyFee` — and `MASP._takeFee` — divide by.
///
/// Re-exported from the SDK rather than spelled `10_000n` locally: it is a
/// property of the contract, and a local copy would go on agreeing with a
/// changed one only by luck. Same reasoning as `PUBLIC_IN_MAX` in `format`.
export { BPS_DENOMINATOR };

export type FeeMode = "deposit" | "withdraw";

export interface FeeBreakdown {
  /// Asset scale × user amount, in token base units. For deposits this is
  /// what the contract escrows; for withdraws it's the gross unshield amount.
  inAmt: bigint;
  /// Fee in token base units.
  fee: bigint;
  /// User's net cash delta in base units:
  ///   deposit  → `inAmt + fee` (payer is debited, fee added on top)
  ///   withdraw → `inAmt - fee` (recipient is credited, fee deducted)
  total: bigint;
  /// Raw bps fee from `MASP.feeBps()`.
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
}

export function feeBreakdown({ amount, scale, feeBps, mode }: FeeInputs): FeeBreakdown {
  const inAmt = amount * scale;
  const fee = applyFee(inAmt, feeBps);
  return {
    inAmt,
    fee,
    total: mode === "deposit" ? inAmt + fee : inAmt - fee,
    feeBps,
    mode,
  };
}
