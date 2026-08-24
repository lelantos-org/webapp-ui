// Shared amount-input helpers for the action forms: parse a decimal string
// against the selected asset, then validate against the asset cap and (for
// spends) the balance.

import { BPS_DENOMINATOR, feeBreakdown } from "@/shared/lib/fees";
import {
  exceedsPublicInLimit,
  formatAmountForAsset,
  PUBLIC_IN_MAX,
  parseAmountForAsset,
} from "@/shared/lib/format";

export interface AssetMeta {
  decimals: number;
  scale: bigint;
  symbol?: string;
  /// Backing ERC-20 address, used to look up a USD price. Optional because the
  /// placeholder metas the forms fall back to describe no real token; a meta
  /// without one simply renders no dollar figure.
  token?: string;
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
  /// Deposits only — an amount is entered but the protocol fee is not known
  /// yet, so `amount + fee` cannot be checked against the balance. Distinct
  /// from `insufficient`, which is a statement about the user's funds.
  feeUnknown: boolean;
  /// Convenience: form has a non-zero, in-range, balance-covered amount whose
  /// total cost is known.
  valid: boolean;
}

export function validateAmount(
  parsed: bigint | undefined,
  selected: AssetMeta | undefined,
  balance: bigint | undefined,
): AmountValidation {
  if (!selected || parsed === undefined || parsed <= 0n) {
    return { tooLarge: false, insufficient: false, feeUnknown: false, valid: false };
  }
  const tooLarge = exceedsPublicInLimit(parsed);
  const insufficient = balance !== undefined && parsed > balance;
  return { tooLarge, insufficient, feeUnknown: false, valid: !tooLarge && !insufficient };
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
/// Skips the check entirely until the balance is known, and reports an unknown
/// fee as `feeUnknown` rather than validating the bare amount.
///
/// The fallback to the un-feed amount was the bug: `total ?? amountBase` made
/// the whole balance a valid deposit for the 300ms debounce plus the RPC — and
/// permanently, if the fee query errored, since `fee.data` then stays
/// `undefined` forever. Clicking through cost a Permit2 signature and a
/// `transferFrom` that reverts for `amount + fee`. `setup.blocked` did not
/// cover it either: `evaluateSetup` falls back to `target = total ?? 1n`, so
/// any non-zero allowance reads as "no setup needed".
export function validateDepositAmount(
  parsed: bigint | undefined,
  selected: AssetMeta | undefined,
  balanceBase: bigint | undefined,
  totalBase: bigint | undefined,
): AmountValidation {
  const v = validateAmount(parsed, selected, undefined);
  if (!v.valid) return v;
  if (totalBase === undefined) return { ...v, feeUnknown: true, valid: false };
  if (balanceBase === undefined) return v;

  const insufficient = totalBase > balanceBase;
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
  // Not an error the user can act on, and it clears on its own within a few
  // hundred ms — the disabled submit button is the whole signal.
  return undefined;
}

/// The largest deposit the wallet's balance can actually cover, in circuit
/// units — or `undefined` when there is nothing to compute it from.
///
/// A deposit is charged the protocol fee *on top* (`total = inAmt + fee`), so
/// "max" is not the balance: depositing the whole balance costs a Permit2
/// signature and then reverts on a `transferFrom` for `amount + fee`. The
/// figure wanted is the largest `amount` whose `total` still fits.
///
/// Solved, then corrected in both directions. `inAmt ≈ balance * BPS /
/// (BPS + feeBps)` inverts the fee, but `applyFee` truncates, so the algebra
/// can land either side of the true maximum by a unit — over, which would
/// revert, and under, which quietly short-changes the user. Both loops re-check
/// against the same `feeBreakdown` the form and the mutation use rather than
/// trusting the inverse of a lossy function, and each runs a step or two.
///
/// Clamped to the `uint48` publicIn cap: a balance above it would otherwise
/// produce a "max" that `validateAmount` immediately rejects as too large.
export function depositMaxAmount(
  balanceBase: bigint | undefined,
  scale: bigint,
  feeBps: bigint | undefined,
): bigint | undefined {
  if (balanceBase === undefined || feeBps === undefined) return undefined;
  if (balanceBase <= 0n || scale <= 0n) return undefined;

  const fits = (amount: bigint) =>
    feeBreakdown({ amount, scale, feeBps, mode: "deposit" }).total <= balanceBase;

  let amount = (balanceBase * BPS_DENOMINATOR) / (BPS_DENOMINATOR + feeBps) / scale;
  while (amount > 0n && !fits(amount)) amount -= 1n;
  while (fits(amount + 1n)) amount += 1n;

  if (amount <= 0n) return undefined;
  return exceedsPublicInLimit(amount) ? PUBLIC_IN_MAX : amount;
}

/// Render an asset balance for the "max" button click handler.
export function formatBalance(balance: bigint, selected: AssetMeta): string {
  return formatAmountForAsset(balance, selected.decimals, selected.scale);
}

/// Default meta for `balanceHint` when the registry hasn't loaded yet —
/// shows raw integer (no decimals known).
export const NO_META: AssetMeta = { decimals: 0, scale: 1n };
