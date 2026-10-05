import type { RegisteredAsset } from "@/config/chains";
import { amountTextReason, NO_ASSETS_REASON } from "@/features/op-form";
import { paymentRequestUrl } from "@/features/payment-request";
import { memoProblem } from "@/shared/domain/memo";
import { normalizeNumericInput } from "@/shared/lib/format/number";

const ENTER_REQUEST_REASON = "Enter an amount to request";

export interface RequestLinkInputs {
  origin: string;
  chainId: bigint;
  /// The requester's shielded address; `undefined` before the wallet is built.
  address: string | undefined;
  /// The active chain registers at least one asset.
  hasAssets: boolean;
  selected: RegisteredAsset | undefined;
  amountText: string;
  /// `amountText` in circuit units; `undefined` when it does not parse.
  parsed: bigint | undefined;
  /// The amount passed the field's own validation.
  amountValid: boolean;
  /// The memo asked of the payer; empty for none.
  memoText: string;
}

type RequestLinkResult =
  | { url: string; amountLabel: string }
  /// `reason` is absent where the amount field already shows it.
  | { url?: undefined; reason: string | undefined };

/// The link asking for the entered amount, or why there is none to share yet.
export function requestLink({
  origin,
  chainId,
  address,
  hasAssets,
  selected,
  amountText,
  parsed,
  amountValid,
  memoText,
}: RequestLinkInputs): RequestLinkResult {
  if (!hasAssets) return { reason: NO_ASSETS_REASON };
  if (!selected) return { reason: "Choose an asset" };
  const reason = amountTextReason(amountText, parsed, selected.symbol, ENTER_REQUEST_REASON);
  if (reason !== undefined || !amountValid || address === undefined) return { reason };
  // The memo field says what is wrong with it.
  if (memoProblem(memoText) !== undefined) return { reason: undefined };

  // Plain `1234.5`, whatever the locale it was typed in: what the payer's amount field parses.
  const amount = normalizeNumericInput(amountText);
  return {
    url: paymentRequestUrl(origin, {
      chainId,
      to: address,
      asset: selected.id,
      amount,
      memo: memoText,
    }),
    amountLabel: `${amount} ${selected.symbol}`,
  };
}
