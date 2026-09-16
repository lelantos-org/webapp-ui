// Bundles the amount concern for the deposit form: what the user typed, what it
// will cost, whether that is coverable, and what "max" should write. The
// counterpart of `use-deposit-setup`, which does the same for the
// Permit2 authorization gating the same form.
//
// A deposit's amount differs from the other forms': it draws on the public
// wallet rather than the shielded balance, the two are denominated differently,
// and the protocol fee is charged on top. Three separate reads must therefore
// agree before the submit button can be trusted, so they are resolved together.
//
// The relayer may be paid in another token (`use-deposit-relayer-fee`). That fee
// is then a second pull from the public wallet, so the figures are stated per
// token (the SDK's `depositPulls`): the principal — amount plus protocol fee — in the
// deposited token, the relayer's charge in the paying one, summed only where the
// two are one token.

import type { TokenAmount } from "@lelantos-org/sdk";
import { type DepositPullEntry as DepositPull, depositPulls } from "@lelantos-org/sdk/protocol";
import type { RegisteredAsset } from "@/config/chains";
import { useDepositSourceBalance } from "@/features/assets";
import { feeIncoming, settledFee, shownFee, useAssetFeeBps, useFeePreview } from "@/features/fees";
import {
  type AmountValidation,
  depositMaxAmount,
  parseAmountSafe,
  validateDepositAmount,
} from "@/features/op-form";
import type { FeeBreakdown } from "@/shared/domain/fee-math";
import { ZERO_BASE } from "@/shared/domain/units";
import { type DepositRelayerFee, useDepositRelayerFee } from "./use-deposit-relayer-fee";

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
  /// `amount + protocolFee` in base units of the deposited token: the principal
  /// the pool pulls, whichever token pays the relayer.
  principalTotal: TokenAmount | undefined;
  /// The relayer's charge, in base units of the asset paying it. See
  /// `DepositRelayerFee.amount`.
  relayerFee: TokenAmount | undefined;
  /// The fee asset as it applies to this deposit: the user's choice, or
  /// `undefined` for the deposited asset (the SDK's default) or a locked path.
  feeAsset: bigint | undefined;
  /// Choose the asset paying the relayer. Pass to the fee panel, and only where
  /// the choice is offered: a native-ETH deposit pays in the wrapped coin.
  onFeeAsset(asset: bigint): void;
  /// The asset paying the relayer where the pool pulls that fee on its own, for
  /// copy naming the second token; `undefined` when the fee rides with the
  /// principal. See `DepositPulls.separateFee`.
  separateFee: RegisteredAsset | undefined;
  /// What the pool pulls, per distinct token. Sizes the Permit2 setup for each
  /// (`useDepositSetup`): the SDK takes the AllowanceTransfer path only when
  /// every token's window covers its pull.
  pulls: DepositPull<RegisteredAsset, TokenAmount | undefined>[];
  /// Why the relayer's charge cannot be known, as opposed to not known yet. The
  /// total is then unknown, the submit is held, and this says why.
  relayerProblem: DepositRelayerFee["problem"];
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
  const parsed = parseAmountSafe(input, selected);
  const fee = useFeePreview(selected?.id, parsed, "deposit");
  const sourceBalance = useDepositSourceBalance(selected?.id, asEth);
  // Independent of the amount, unlike the debounced preview above, which cannot
  // size a "max" that must exist before anything is typed. The deposit leg's
  // rate specifically: it is charged on top of the amount, so it is what a
  // "max" has to leave room for.
  const feeBps = useAssetFeeBps(selected?.id, "deposit");
  const relayer = useDepositRelayerFee(selected, asEth);

  const settled = settledFee(fee);
  const principalTotal = settled?.total;
  const plan =
    selected && relayer.paying
      ? depositPulls({
          deposited: selected,
          feeAsset: relayer.paying,
          principal: principalTotal,
          relayer: relayer.amount,
        })
      : undefined;
  // What the deposited token's balance must cover. Held until the relayer's
  // charge is known even when it is pulled in another token, so the submit never
  // goes live on half the figures.
  const coverTotal = relayer.amount === undefined ? undefined : plan?.byToken[0]?.amount;
  // Only a fee drawn from the deposited token leaves less of it for the amount.
  const reserve = plan?.feeSharesToken ? (relayer.amount ?? ZERO_BASE) : ZERO_BASE;

  return {
    parsed,
    sourceBalance,
    fee: settled,
    feeShown: shownFee(fee),
    feePending: feeIncoming(fee),
    principalTotal,
    relayerFee: relayer.amount,
    feeAsset: relayer.feeAsset,
    onFeeAsset: relayer.onFeeAsset,
    separateFee: plan?.separateFee,
    pulls: plan?.byToken ?? [],
    validation: validateDepositAmount(parsed, selected, sourceBalance, coverTotal),
    // Withheld on the native-ETH path: the funding source is the native balance
    // and the gas the deposit burns is not knowable here, so any figure offered
    // would exceed what the user can send.
    maxAmount: asEth
      ? undefined
      : depositMaxAmount(sourceBalance, selected?.scale ?? 1n, feeBps, reserve, selected?.index),
    feeFailed: fee.isError,
    retryFee: () => void fee.refetch(),
    relayerProblem: relayer.problem,
    retryRelayerFee: relayer.retry,
  };
}
