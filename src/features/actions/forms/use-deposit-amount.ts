// Bundles the amount concern for the deposit form: what the user typed, what
// it will actually cost, whether that is coverable, and what "max" should
// write. The counterpart of `onboarding/use-deposit-setup`, which does the
// same for the Permit2 authorization the same form is gated on.
//
// A deposit's amount is not the simple thing the other forms have. It draws on
// the public wallet rather than the shielded balance, the two are denominated
// differently, and the protocol fee is charged *on top* — so three separate
// reads have to agree before the submit button can be trusted. Keeping them
// together is what makes their disagreements visible.

import {
  type AmountValidation,
  depositMaxAmount,
  parseAmountSafe,
  validateDepositAmount,
} from "@/features/actions/forms/amount-field";
import { settledFee } from "@/features/actions/forms/fee-hint";
import { useFeeBps, useFeePreview } from "@/features/actions/use-fee-preview";
import type { RegisteredAsset } from "@/features/assets/registered-assets";
import { useDepositSourceBalance } from "@/features/assets/transparent-balances";
import type { FeeBreakdown } from "@/shared/lib/fees";

export interface DepositAmount {
  /// The typed amount in circuit units; `undefined` while the input is partial
  /// or finer than the asset's granularity.
  parsed: bigint | undefined;
  /// Balance the deposit draws on, in token base units. The public wallet's,
  /// not the shielded one — a deposit moves funds in.
  sourceBalance: bigint | undefined;
  /// The fee preview, or `undefined` while the debounce is catching up. Never
  /// the previous keystroke's figure; see `settledFee`.
  fee: FeeBreakdown | undefined;
  /// `amount + fee` in base units — what actually leaves the wallet. Feeds the
  /// Permit2 allowance sizing in `useDepositSetup`.
  total: bigint | undefined;
  validation: AmountValidation;
  /// What the "max" button writes, or `undefined` where no honest figure
  /// exists.
  maxAmount: bigint | undefined;
  /// The fee read failed outright, as opposed to not having settled yet.
  ///
  /// Worth separating because the two look identical to `validation` — both
  /// leave it `feeUnknown` and the submit disabled — and only one of them
  /// clears on its own. React Query does not retry a failed query unprompted,
  /// so without this the form is disabled for the rest of the session with
  /// nothing on screen to say why.
  feeFailed: boolean;
  /// Re-run the failed fee read.
  retryFee(): void;
}

export interface DepositAmountInputs {
  /// Native-ETH deposit: the funding source is the native balance, and the
  /// asset is WETH only by encoding.
  asEth: boolean;
  /// Raw text from the amount field.
  input: string;
}

export function useDepositAmount(
  selected: RegisteredAsset | undefined,
  { asEth, input }: DepositAmountInputs,
): DepositAmount {
  const parsed = parseAmountSafe(input, selected);
  const fee = useFeePreview(selected?.id, parsed);
  const sourceBalance = useDepositSourceBalance(selected?.id, asEth);
  // Chain-wide and independent of the amount, unlike the preview above — which
  // is debounced, and so cannot size a "max" that has to exist before anything
  // is typed.
  const feeBps = useFeeBps();

  const settled = settledFee(fee);
  const total = settled?.total;

  return {
    parsed,
    sourceBalance,
    fee: settled,
    total,
    validation: validateDepositAmount(parsed, selected, sourceBalance, total),
    // Withheld on the native-ETH path: the funding source is the native
    // balance, and the gas the deposit itself burns is not knowable here, so
    // every figure this could offer is one the user cannot actually send.
    maxAmount: asEth ? undefined : depositMaxAmount(sourceBalance, selected?.scale ?? 1n, feeBps),
    feeFailed: fee.isError,
    retryFee: () => void fee.refetch(),
  };
}
