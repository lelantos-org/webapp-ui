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
  const tooLarge = exceedsPublicInLimit(parsed, selected.scale);
  const insufficient = balance !== undefined && parsed > balance;
  return { tooLarge, insufficient, valid: !tooLarge && !insufficient };
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
