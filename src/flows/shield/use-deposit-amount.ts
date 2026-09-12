// Bundles the amount concern for the deposit form: what the user typed, what it
// will cost, whether that is coverable, and what "max" should write. The
// counterpart of `setup/use-deposit-setup`, which does the same for the
// Permit2 authorization gating the same form.
//
// A deposit's amount differs from the other forms': it draws on the public
// wallet rather than the shielded balance, the two are denominated differently,
// and the protocol fee is charged on top. Three separate reads must therefore
// agree before the submit button can be trusted, so they are resolved together.

import type { TokenAmount } from "@lelantos-org/sdk/core";
import type { RegisteredAsset } from "@/config/chains";
import { useDepositSourceBalance, useRegisteredAssets } from "@/features/assets";
import {
  feeIncoming,
  feeOptionFor,
  resolveFeeOption,
  settledFee,
  shownFee,
  useAssetFeeBps,
  useFeePreview,
  useFeeQuote,
} from "@/features/fees";
import {
  type AmountValidation,
  depositMaxAmount,
  parseAmountSafe,
  validateDepositAmount,
} from "@/features/op-form";
import type { FeeBreakdown } from "@/shared/domain/fee-math";
import { asBaseUnits, toBaseUnits, ZERO_BASE } from "@/shared/domain/units";

export interface DepositAmount {
  /// The typed amount in circuit units; `undefined` while the input is partial
  /// or finer than the asset's granularity.
  parsed: bigint | undefined;
  /// Balance the deposit draws on, in token base units: the public wallet's
  /// rather than the shielded one, since a deposit moves funds in.
  sourceBalance: TokenAmount | undefined;
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
  total: TokenAmount | undefined;
  /// The relayer's charge for flushing this deposit, in base units. `undefined`
  /// while the quote is loading, when it failed, or when the relayer charges but
  /// quotes nothing for this asset; `0n` only on a chain that subsidises.
  relayerFee: TokenAmount | undefined;
  /// Why the relayer's charge cannot be known, as opposed to not known yet.
  ///
  /// Neither may read as `0n`: a failed quote, or a quote with no option for the
  /// asset, would then size a Permit2 window short of what the pool pulls,
  /// passing every check here and failing at submit. Instead the total is
  /// unknown, the submit is held, and this says why.
  relayerProblem: "quote-failed" | "not-accepted" | undefined;
  /// Re-run a failed relayer quote.
  retryRelayerFee(): void;
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
  const fee = useFeePreview(selected?.id, parsed, "deposit");
  const sourceBalance = useDepositSourceBalance(selected?.id, asEth);
  // Independent of the amount, unlike the debounced preview above, which cannot
  // size a "max" that must exist before anything is typed. The deposit leg's
  // rate specifically: it is charged on top of the amount, so it is what a
  // "max" has to leave room for.
  const feeBps = useAssetFeeBps(selected?.id, "deposit");

  // A deposit's relayer note is minted in the deposited asset, so there is one
  // option to read rather than a choice. Amount-independent, like `feeBps` above,
  // so it is available before anything is typed and can size the "max" button.
  const quote = useFeeQuote("deposit");
  const relayer = resolveFeeOption(feeOptionFor(quote.data, selected?.id), registry);
  const relayerProblem = quote.isError
    ? "quote-failed"
    : quote.data?.charged && selected && !relayer
      ? "not-accepted"
      : undefined;
  const relayerFee =
    // A placeholder is the previous chain's or account's quote, kept on screen
    // while this one loads; it prices nothing here.
    quote.data === undefined || quote.isPlaceholderData || relayerProblem
      ? undefined
      : quote.data.charged && relayer
        ? // Through the yield index, as the fee panel's rows are: a unit of a
          // yield asset is worth `scale * index / RAY`, so `amount * scale`
          // under-reserved the fee in both the total and the max.
          toBaseUnits(relayer.amount, relayer.asset.scale, relayer.asset.index)
        : ZERO_BASE;

  const settled = settledFee(fee);
  const total =
    settled && relayerFee !== undefined ? asBaseUnits(settled.total + relayerFee) : undefined;

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
      : depositMaxAmount(
          sourceBalance,
          selected?.scale ?? 1n,
          feeBps,
          relayerFee ?? ZERO_BASE,
          selected?.index,
        ),
    feeFailed: fee.isError,
    retryFee: () => void fee.refetch(),
    relayerProblem,
    retryRelayerFee: () => void quote.refetch(),
  };
}
