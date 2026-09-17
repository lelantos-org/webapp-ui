import type { FeeBlock } from "@/features/fees";
import { ENTER_AMOUNT_REASON, type SubmitBlock } from "@/features/op-form";
import { normalizeNumericInput } from "@/shared/lib/format/number";
import { joinNames, uncheckedApprovalsLine } from "./setup/setup-copy";
import type { DepositAmount } from "./use-deposit-amount";

export interface DepositBlockInput {
  /// The asset being shielded, or `undefined` with an empty registry.
  symbol: string | undefined;
  amountText: string;
  amount: Pick<
    DepositAmount,
    "parsed" | "validation" | "feeFailed" | "relayerProblem" | "separateFee"
  >;
  /// From `useDepositSetup`; `symbols` names the tokens setup is for.
  setup: {
    applicable: boolean;
    needsSetup: boolean;
    unknown: boolean;
    blocked: boolean;
    symbols: readonly string[];
  };
  /// What stops the relayer being paid (`FeePanel.block`).
  feeBlock: FeeBlock | undefined;
}

function depositBlockedReason(input: DepositBlockInput): string | undefined {
  const { symbol, amount } = input;
  const text = normalizeNumericInput(input.amountText);
  if (!symbol) return "No assets to shield on this network";
  if (text === "") return ENTER_AMOUNT_REASON;
  const v = amount.validation;
  if (v.tooLarge || v.insufficient) return undefined;
  if (amount.parsed === undefined) {
    if (/^\d*\.?$/.test(text)) return ENTER_AMOUNT_REASON;
    return /^\d*\.\d+$/.test(text)
      ? `${symbol} can't be split that finely`
      : "Enter the amount as a number";
  }
  if (amount.parsed <= 0n) return ENTER_AMOUNT_REASON;
  if (amount.relayerProblem === "quote-failed") return "Couldn't get the relayer's fee — try again";
  if (amount.relayerProblem === "not-accepted") {
    return amount.separateFee
      ? `The relayer doesn't take ${amount.separateFee.symbol} for its fee right now`
      : `The relayer doesn't take ${symbol} deposits right now`;
  }
  if (input.feeBlock?.kind === "shortfall") {
    return `Not enough ${input.feeBlock.symbol} in your wallet for the relayer fee`;
  }
  if (amount.feeFailed) return "Couldn't read the network fee — try again";
  const setup = input.setup.applicable ? input.setup : undefined;
  const setupNames = setup?.symbols.length ? setup.symbols : [symbol];
  if (setup?.unknown) return `${uncheckedApprovalsLine(setupNames)} — run setup`;
  if (setup?.needsSetup) return `Set up ${joinNames(setupNames)} first`;
  if (v.feeUnknown) return "Working out the fee…";
  if (setup?.blocked) return `Checking ${symbol}'s approval…`;
  return undefined;
}

/// Shield's submit state and the reason under it; `disabled` is not derived from the reason.
export function depositSubmitBlock(input: DepositBlockInput): SubmitBlock {
  const reason = depositBlockedReason(input);
  const disabled = !input.amount.validation.valid || input.setup.blocked || !!input.feeBlock;
  return reason === undefined ? { disabled } : { disabled, reason };
}
