// Bundles the amount concern for the deposit form: what the user typed, what it
// will cost, whether that is coverable, and what "max" should write. The
// counterpart of `onboarding/use-deposit-setup`, which does the same for the
// Permit2 authorization gating the same form.
//
// A deposit's amount differs from the other forms': it draws on the public
// wallet rather than the shielded balance, the two are denominated differently,
// and the protocol fee is charged on top. Three separate reads must therefore
// agree before the submit button can be trusted, so they are resolved together.

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
  /// Balance the deposit draws on, in token base units: the public wallet's
  /// rather than the shielded one, since a deposit moves funds in.
  sourceBalance: bigint | undefined;
  /// The fee preview, or `undefined` while the debounce is catching up. Never
  /// the previous keystroke's figure; see `settledFee`. Gate the submit on this.
  fee: FeeBreakdown | undefined;
  /// The same preview for display, which may include a figure held over from the
  /// previous amount. See `shownFee` for why the fee panel uses the held-over
  /// figure and validation does not.
  feeShown: FeeBreakdown | undefined;
  /// A protocol-fee figure is still in flight, as opposed to absent. Lets the
  /// fee panel hold a line open for it. See `feeIncoming`.
  feePending: boolean;
  /// `amount + protocolFee + relayerFee` in base units: what leaves the wallet.
  /// Feeds the Permit2 allowance sizing in `useDepositSetup`, so the relayer's
  /// share must be included — the SDK sizes the permit over all three
  /// (`executeDeposit`), and a shorter allowance is refused at submit.
  total: bigint | undefined;
  /// The relayer's charge for flushing this deposit, in base units. `undefined`
  /// while the quote is loading, `0n` on a chain that subsidises.
  relayerFee: bigint | undefined;
  validation: AmountValidation;
  /// What the "max" button writes, or `undefined` where no accurate figure can
  /// be produced.
  maxAmount: bigint | undefined;
  /// The fee read failed, as opposed to not having settled yet.
  ///
  /// Separated because the two are indistinguishable to `validation` — both
  /// leave it `feeUnknown` and the submit disabled — and only one clears on its
  /// own. React Query does not retry a failed query unprompted, so without this
  /// the form stays disabled for the session with nothing to explain it.
  feeFailed: boolean;
  /// Re-run the failed fee read.
  retryFee(): void;
}

export interface DepositAmountInputs {
  /// Native-ETH deposit: the funding source is the native balance, and the asset
  /// is WETH only by encoding.
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
  // Chain-wide and independent of the amount, unlike the debounced preview
  // above, which cannot size a "max" that must exist before anything is typed.
  const feeBps = useFeeBps();

  // A deposit's relayer note is minted in the deposited asset, so there is one
  // option to read rather than a choice. Amount-independent, like `feeBps` above,
  // so it is available before anything is typed and can size the "max" button.
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
    // Withheld on the native-ETH path: the funding source is the native balance
    // and the gas the deposit burns is not knowable here, so any figure offered
    // would exceed what the user can send.
    maxAmount: asEth
      ? undefined
      : depositMaxAmount(sourceBalance, selected?.scale ?? 1n, feeBps, relayerFee ?? 0n),
    feeFailed: fee.isError,
    retryFee: () => void fee.refetch(),
  };
}
