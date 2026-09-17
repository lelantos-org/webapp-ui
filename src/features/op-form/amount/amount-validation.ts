import type { CircuitAmount, TokenAmount } from "@lelantos-org/sdk";
import { PUBLIC_IN_MAX, RAY } from "@lelantos-org/sdk/protocol";
import { BPS_DENOMINATOR, feeBreakdown } from "@/shared/domain/fee-math";
import { type AssetLabel, type AssetUnits, ZERO_BASE } from "@/shared/domain/units";
import { parseAmountInput } from "@/shared/lib/format/asset";

/// What a form knows about the selected asset: its units, and its label once the registry loads.
export interface AssetMeta extends AssetUnits, Partial<AssetLabel> {}

/// Parses typed input, returning `undefined` instead of throwing on partial input.
export function parseAmountSafe(
  input: string,
  selected: AssetMeta | undefined,
): CircuitAmount | undefined {
  if (!selected || !input) return undefined;
  try {
    return parseAmountInput(input, selected);
  } catch {
    return undefined;
  }
}

/// The amount field's validity flags.
export interface AmountValidation {
  /// `parsed * scale` would overflow MASP's `uint48` publicIn cap.
  tooLarge: boolean;
  insufficient: boolean;
  /// Deposits only: the protocol fee is not known yet, so `amount + fee` cannot be checked.
  feeUnknown: boolean;
  valid: boolean;
}

/// Validates a spend amount against the publicIn cap and the balance.
export function validateAmount(
  parsed: bigint | undefined,
  selected: AssetMeta | undefined,
  balance: bigint | undefined,
): AmountValidation {
  if (!selected || parsed === undefined || parsed <= 0n) {
    return { tooLarge: false, insufficient: false, feeUnknown: false, valid: false };
  }
  const tooLarge = parsed > PUBLIC_IN_MAX;
  const insufficient = balance !== undefined && parsed > balance;
  return { tooLarge, insufficient, feeUnknown: false, valid: !tooLarge && !insufficient };
}

/// Validates a deposit's `amount + fee` against the public balance, in token base units.
/// An unknown fee is never valid: the bare amount would pass a deposit that reverts on `transferFrom`.
export function validateDepositAmount(
  parsed: bigint | undefined,
  selected: AssetMeta | undefined,
  balanceBase: TokenAmount | undefined,
  totalBase: TokenAmount | undefined,
): AmountValidation {
  const v = validateAmount(parsed, selected, undefined);
  if (!v.valid) return v;
  if (totalBase === undefined) return { ...v, feeUnknown: true, valid: false };
  if (balanceBase === undefined) return v;

  const insufficient = totalBase > balanceBase;
  return { ...v, insufficient, valid: !insufficient };
}

/// The amount field's error string; zod errors take precedence.
export function pickAmountError(
  formErr: string | undefined,
  v: AmountValidation,
): string | undefined {
  if (formErr) return formErr;
  if (v.tooLarge) return "More than this asset allows in one transaction";
  if (v.insufficient) return "More than you hold";
  return undefined;
}

/// The largest deposit, in circuit units, whose `amount + fees` the balance covers.
export function depositMaxAmount(
  balanceBase: TokenAmount | undefined,
  scale: bigint,
  feeBps: bigint | undefined,
  /// The relayer's flat charge in token base units, taken off the top.
  relayerReserve: TokenAmount = ZERO_BASE,
  /// Yield index, RAY-scaled.
  index = RAY,
): bigint | undefined {
  if (balanceBase === undefined || feeBps === undefined) return undefined;
  if (balanceBase <= 0n || scale <= 0n || index <= 0n) return undefined;

  const fits = (amount: bigint) =>
    feeBreakdown({ amount, scale, feeBps, leg: "deposit", index }).total + relayerReserve <=
    balanceBase;

  const spendable = balanceBase - relayerReserve;
  if (spendable <= 0n) return undefined;
  // `applyFee` truncates, so the inverse is only a seed; the loops correct it against `fits`.
  let amount = (spendable * BPS_DENOMINATOR * RAY) / (BPS_DENOMINATOR + feeBps) / (scale * index);
  while (amount > 0n && !fits(amount)) amount -= 1n;
  while (fits(amount + 1n)) amount += 1n;

  if (amount <= 0n) return undefined;
  return amount > PUBLIC_IN_MAX ? PUBLIC_IN_MAX : amount;
}

/// Placeholder meta before the registry loads: raw integers, identity index.
export const NO_META: AssetMeta = { decimals: 0, scale: 1n, index: RAY };
