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

import type { RegisteredAsset } from "@/features/assets";
import { useDepositSourceBalance, useRegisteredAssets } from "@/features/assets";
import type { FeeBreakdown } from "@/shared/lib/fees";
import { useFeeBps, useFeePreview } from "../use-fee-preview";
import { feeOptionFor, resolveFeeOption, useFeeQuote } from "../use-fee-quote";
import {
  type AmountValidation,
  depositMaxAmount,
  parseAmountSafe,
  validateDepositAmount,
} from "./amount-field";
import { feeIncoming, settledFee, shownFee } from "./fee-hint";

export interface DepositAmount {
  /// The typed amount in circuit units; `undefined` while the input is partial
  /// or finer than the asset's granularity.
  parsed: bigint | undefined;
  /// Balance the deposit draws on, in token base units. The public wallet's,
  /// not the shielded one — a deposit moves funds in.
  sourceBalance: bigint | undefined;
  /// The fee preview, or `undefined` while the debounce is catching up. Never
  /// the previous keystroke's figure; see `settledFee`. This is the one to gate
  /// the submit on.
  fee: FeeBreakdown | undefined;
  /// The same preview for *display*, which does include a figure held over
  /// from the previous amount. See `shownFee` for why the fee panel wants the
  /// held-over one and validation does not.
  feeShown: FeeBreakdown | undefined;
  /// A protocol-fee figure is still on its way, as opposed to absent for good.
  /// Lets the fee panel hold a line open for it. See `feeIncoming`.
  feePending: boolean;
  /// `amount + protocolFee + relayerFee` in base units — what actually leaves
  /// the wallet. Feeds the Permit2 allowance sizing in `useDepositSetup`, so
  /// the relayer's share has to be in it: the SDK sizes the permit over all
  /// three (`executeDeposit`), and an allowance short of that is refused at
  /// submit.
  total: bigint | undefined;
  /// The relayer's charge for flushing this deposit, in base units. `undefined`
  /// while the quote is loading, `0n` on a chain that subsidises.
  relayerFee: bigint | undefined;
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
  const registry = useRegisteredAssets();
  const parsed = parseAmountSafe(input, selected);
  const fee = useFeePreview(selected?.id, parsed);
  const sourceBalance = useDepositSourceBalance(selected?.id, asEth);
  // Chain-wide and independent of the amount, unlike the preview above — which
  // is debounced, and so cannot size a "max" that has to exist before anything
  // is typed.
  const feeBps = useFeeBps();

  // A deposit's relayer note is minted in the deposited asset, so there is no
  // choice to make here — just the one option to read. Amount-independent, like
  // `feeBps` above, so it is available before anything is typed and can size
  // the "max" button.
  const quote = useFeeQuote("deposit");
  const relayer = resolveFeeOption(feeOptionFor(quote.data, selected?.id), registry);
  const relayerFee = quote.isPending
    ? undefined
    : (relayer?.amount ?? 0n) * (relayer?.asset.scale ?? 1n);

  const settled = settledFee(fee);
  const total = settled && relayerFee !== undefined ? settled.total + relayerFee : undefined;

  return {
    parsed,
    sourceBalance,
    fee: settled,
    feeShown: shownFee(fee),
    feePending: feeIncoming(fee),
    total,
    relayerFee,
    validation: validateDepositAmount(parsed, selected, sourceBalance, total),
    // Withheld on the native-ETH path: the funding source is the native
    // balance, and the gas the deposit itself burns is not knowable here, so
    // every figure this could offer is one the user cannot actually send.
    maxAmount: asEth
      ? undefined
      : depositMaxAmount(sourceBalance, selected?.scale ?? 1n, feeBps, relayerFee ?? 0n),
    feeFailed: fee.isError,
    retryFee: () => void fee.refetch(),
  };
}
