// Shared amount-input helpers for the action forms: parse a decimal string
// against the selected asset, then validate against the asset cap and (for
// spends) the balance.

import {
  exceedsPublicInLimit,
  formatAmountForAsset,
  parseAmountForAsset,
} from "@/shared/lib/format";

export interface AssetMeta {
  decimals: number;
  scale: bigint;
  symbol?: string;
}

/// Permissive parse: returns `undefined` rather than throwing on partial /
/// invalid input so the form can still render while the user types.
export function parseAmountSafe(
  input: string,
  selected: AssetMeta | undefined,
): bigint | undefined {
  if (!selected || !input) return undefined;
  try {
    return parseAmountForAsset(input, selected.decimals, selected.scale);
  } catch {
    return undefined;
  }
}

export interface AmountValidation {
  /// `parsed * scale` would overflow MASP's `uint48` publicIn cap.
  tooLarge: boolean;
  /// Spend ops only — `parsed > balance`.
  insufficient: boolean;
  /// Convenience: form has a non-zero, in-range, balance-covered amount.
  valid: boolean;
}

export function validateAmount(
  parsed: bigint | undefined,
  selected: AssetMeta | undefined,
  balance: bigint | undefined,
): AmountValidation {
  if (!selected || parsed === undefined || parsed <= 0n) {
    return { tooLarge: false, insufficient: false, valid: false };
  }
  const tooLarge = exceedsPublicInLimit(parsed);
  const insufficient = balance !== undefined && parsed > balance;
  return { tooLarge, insufficient, valid: !tooLarge && !insufficient };
}

/// Deposit's balance check, which differs from a spend's in two ways.
///
/// The funding source is the public wallet, whose balance is in token base
/// units rather than the circuit units a shielded balance carries — so the
/// comparison is made in base units instead of converting and losing the
/// remainder. And the protocol fee is charged *on top* for a deposit
/// (`total = inAmt + fee`), so validating the amount alone would accept a
/// deposit of the entire balance and let it fail at submit.
///
/// Falls back to the un-feed amount while the fee preview is in flight, and
/// skips the check entirely until the balance is known.
export function validateDepositAmount(
  parsed: bigint | undefined,
  selected: AssetMeta | undefined,
  balanceBase: bigint | undefined,
  totalBase: bigint | undefined,
): AmountValidation {
  const v = validateAmount(parsed, selected, undefined);
  if (!v.valid || balanceBase === undefined) return v;

  const amountBase = selected && parsed !== undefined ? parsed * selected.scale : undefined;
  const spend = totalBase ?? amountBase;
  if (spend === undefined) return v;

  const insufficient = spend > balanceBase;
  return { ...v, insufficient, valid: !insufficient };
}

/// Pick the most actionable amount-field error string. Form-validation
/// errors (zod) win over derived ones.
export function pickAmountError(
  formErr: string | undefined,
  v: AmountValidation,
): string | undefined {
  if (formErr) return formErr;
  if (v.tooLarge) return "amount exceeds asset cap";
  if (v.insufficient) return "exceeds available balance";
  return undefined;
}

/// Render an asset balance for the "max" button click handler.
export function formatBalance(balance: bigint, selected: AssetMeta): string {
  return formatAmountForAsset(balance, selected.decimals, selected.scale);
}

/// Default meta for `balanceHint` when the registry hasn't loaded yet —
/// shows raw integer (no decimals known).
export const NO_META: AssetMeta = { decimals: 0, scale: 1n };
