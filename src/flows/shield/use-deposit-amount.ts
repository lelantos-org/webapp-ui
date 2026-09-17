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
  /// The typed amount in circuit units; `undefined` while partial or too fine.
  parsed: bigint | undefined;
  /// Public wallet balance the deposit draws on, in token base units.
  sourceBalance: TokenAmount | undefined;
  /// Settled fee preview (never a stale figure); gate the submit on this.
  fee: FeeBreakdown | undefined;
  /// Fee preview for display, possibly held over from the previous amount.
  feeShown: FeeBreakdown | undefined;
  /// A protocol-fee figure is in flight, as opposed to absent.
  feePending: boolean;
  /// `amount + protocolFee` in base units of the deposited token.
  principalTotal: TokenAmount | undefined;
  /// The relayer's charge, in base units of the asset paying it.
  relayerFee: TokenAmount | undefined;
  /// The chosen fee asset, or `undefined` for the deposited asset or a locked path.
  feeAsset: bigint | undefined;
  /// Choose the asset paying the relayer (not offered on native ETH).
  onFeeAsset(asset: bigint): void;
  /// The relayer's fee asset when pulled separately from the principal.
  separateFee: RegisteredAsset | undefined;
  /// What the pool pulls per distinct token; sizes each token's Permit2 setup.
  pulls: DepositPull<RegisteredAsset, TokenAmount | undefined>[];
  /// Why the relayer's charge cannot be known, as opposed to not known yet.
  relayerProblem: DepositRelayerFee["problem"];
  retryRelayerFee(): void;
  validation: AmountValidation;
  /// What "max" writes, or `undefined` where no accurate figure exists.
  maxAmount: bigint | undefined;
  /// The fee read failed (not retried on its own), as opposed to not settled yet.
  feeFailed: boolean;
  retryFee(): void;
}

export interface DepositAmountInputs {
  /// Native-ETH deposit: funded from the native balance; the asset is WETH only by encoding.
  asEth: boolean;
  input: string;
}

/// The deposit form's amount, fees, per-token pulls, validation and "max".
export function useDepositAmount(
  selected: RegisteredAsset | undefined,
  { asEth, input }: DepositAmountInputs,
): DepositAmount {
  const parsed = parseAmountSafe(input, selected);
  const fee = useFeePreview(selected?.id, parsed, "deposit");
  const sourceBalance = useDepositSourceBalance(selected?.id, asEth);
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
  // Held until the relayer charge is known, so submit never goes live on half the figures.
  const coverTotal = relayer.amount === undefined ? undefined : plan?.byToken[0]?.amount;
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
    // No max on native ETH: unknown gas would make any figure exceed what can be sent.
    maxAmount: asEth
      ? undefined
      : depositMaxAmount(sourceBalance, selected?.scale ?? 1n, feeBps, reserve, selected?.index),
    feeFailed: fee.isError,
    retryFee: () => void fee.refetch(),
    relayerProblem: relayer.problem,
    retryRelayerFee: relayer.retry,
  };
}
