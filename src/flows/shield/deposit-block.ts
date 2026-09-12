// What stops Shield from being submitted.
//
// Apart from `use-deposit-amount.ts` because it reads three concerns at once —
// the amount, the relayer's quote and the Permit2 setup — and is pure, so its
// ordering is testable without any of the hooks behind them.

import type { SubmitBlock } from "@/features/op-form";
import { normalizeNumericInput } from "@/shared/lib/format/number";
import type { DepositAmount } from "./use-deposit-amount";

export interface DepositBlockInput {
  /// The asset being shielded, or `undefined` with an empty registry.
  symbol: string | undefined;
  /// The amount field's raw text.
  amountText: string;
  amount: Pick<DepositAmount, "parsed" | "validation" | "feeFailed" | "relayerProblem">;
  /// From `useDepositSetup`.
  setup: { applicable: boolean; needsSetup: boolean; unknown: boolean; blocked: boolean };
  /// The fee panel reports a relayer that cannot be paid for this deposit.
  feeBlocked: boolean;
}

/// Why Shield's submit is dead, in the order a user can act on it, or
/// `undefined` when nothing is wrong or the field already says what is.
///
/// The same argument `op-form/spend-block.ts` makes for the spends: the user's own
/// input first, then what they can fix, then what only needs waiting for. An
/// amount the field itself flags — over the balance, over the cap — returns
/// `undefined`, because the error under the figure already names it and a second
/// sentence under the button would repeat it.
function depositBlockedReason(input: DepositBlockInput): string | undefined {
  const { symbol, amount } = input;
  const text = normalizeNumericInput(input.amountText);
  if (!symbol) return "No assets to shield on this network";
  if (text === "") return "Enter an amount you hold";
  const v = amount.validation;
  if (v.tooLarge || v.insufficient) return undefined;
  // Unparseable: not a number, or finer than the asset's smallest unit. The
  // field shows no error for either, so this is the only place it is said.
  // A half-typed "1." is neither, and reads as not finished yet.
  if (amount.parsed === undefined) {
    if (/^\d*\.?$/.test(text)) return "Enter an amount you hold";
    return /^\d*\.\d+$/.test(text)
      ? `${symbol} can't be split that finely`
      : "Enter the amount as a number";
  }
  if (amount.parsed <= 0n) return "Enter an amount you hold";
  if (amount.relayerProblem === "quote-failed") return "Couldn't get the relayer's fee — try again";
  if (amount.relayerProblem === "not-accepted") {
    return `The relayer doesn't take ${symbol} deposits right now`;
  }
  if (amount.feeFailed) return "Couldn't read the network fee — try again";
  // Native coin never goes through Permit2, so none of its setup applies.
  const setup = input.setup.applicable ? input.setup : undefined;
  if (setup?.unknown) return `Couldn't check ${symbol}'s approval — run setup`;
  if (setup?.needsSetup) return `Set up ${symbol} first`;
  if (v.feeUnknown) return "Working out the fee…";
  if (setup?.blocked) return `Checking ${symbol}'s approval…`;
  return undefined;
}

/// Shield's submit block: dead until the amount validates against the wallet,
/// the setup it needs is in place and the relayer can be paid, with the reason
/// above under it.
///
/// `disabled` is not derived from the reason. An amount the field itself flags
/// holds the button with nothing said under it, and a reason can be withheld
/// while the button is live for none of these.
export function depositSubmitBlock(input: DepositBlockInput): SubmitBlock {
  const reason = depositBlockedReason(input);
  const disabled = !input.amount.validation.valid || input.setup.blocked || input.feeBlocked;
  return reason === undefined ? { disabled } : { disabled, reason };
}
