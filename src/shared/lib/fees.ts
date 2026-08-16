// Protocol fee math, over the SDK's `applyFee`. Truncating integer division
// mirrors `MASP._takeFee` on-chain.

import { applyFee } from "@lelantos-org/sdk/core";

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
