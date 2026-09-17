import { circuitAmount, type TokenAmount } from "@lelantos-org/sdk";
import { applyFee, BPS_DENOMINATOR, RAY, toTokenUnits } from "@lelantos-org/sdk/protocol";
import type { FeeLeg } from "@/shared/domain/op-kind";
import { asBaseUnits } from "@/shared/domain/units";

/// The basis-point denominator `applyFee` and `MASP._takeFee` divide by.
export { BPS_DENOMINATOR };

export interface FeeBreakdown {
  /// Asset scale times the user amount, in token base units.
  inAmt: TokenAmount;
  /// Fee in token base units.
  fee: TokenAmount;
  /// User's net cash delta in base units: `inAmt + fee` on deposit, `inAmt - fee` on withdraw.
  total: TokenAmount;
  feeBps: bigint;
  leg: FeeLeg;
}

export interface FeeInputs {
  /// Amount in circuit units; `feeBreakdown` brands it and refuses a negative.
  amount: bigint;
  /// Circuit-units → base-units multiplier for the asset.
  scale: bigint;
  feeBps: bigint;
  leg: FeeLeg;
  /// Yield index, RAY-scaled. Defaults to `RAY`, the identity.
  index?: bigint;
}

/// Estimated cost of a leg in base units: rounds up on deposit, down on withdraw. Not the charge.
export function feeBreakdown({ amount, scale, feeBps, leg, index = RAY }: FeeInputs): FeeBreakdown {
  const inAmt = toTokenUnits(circuitAmount(amount), scale, {
    index,
    round: leg === "deposit" ? "up" : "down",
  });
  const fee = asBaseUnits(applyFee(inAmt, feeBps));
  return {
    inAmt,
    fee,
    total: asBaseUnits(leg === "deposit" ? inAmt + fee : inAmt - fee),
    feeBps,
    leg,
  };
}
