import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/forms/ActionForm";
import { AmountField } from "@/features/actions/forms/AmountField";
import { feeLine, joinHint } from "@/features/actions/forms/fee-hint";
import { type DepositInput, depositSchema } from "@/features/actions/forms/schemas";
import { useAmountControls } from "@/features/actions/forms/use-amount-controls";
import { useClearFinishedOp } from "@/features/actions/forms/use-clear-finished-op";
import { useDepositAmount } from "@/features/actions/forms/use-deposit-amount";
import { useSubmitOnce } from "@/features/actions/forms/use-submit-once";
import { useDeposit } from "@/features/actions/mutations";
import { AssetPicker } from "@/features/assets/AssetPicker";
import {
  DEFAULT_ASSET_ID,
  findAsset,
  type RegisteredAsset,
  useRegisteredAssets,
} from "@/features/assets/registered-assets";
import { useEthAssetPicker } from "@/features/assets/use-eth-asset-picker";
import { SetupFlow } from "@/features/onboarding/SetupFlow";
import { SetupNotice } from "@/features/onboarding/SetupNotice";
import { useDepositSetup } from "@/features/onboarding/use-deposit-setup";
import type { FeeBreakdown } from "@/shared/lib/fees";
import { formatDecimalCompact, parseAmountForAsset } from "@/shared/lib/format";
import { Notice } from "@/shared/ui/Notice";

export function DepositForm() {
  const { mutation: m, progress } = useDeposit();
  const assets = useRegisteredAssets();
  const form = useForm<DepositInput>({
    resolver: zodResolver(depositSchema),
    defaultValues: { amount: "", asset: DEFAULT_ASSET_ID, asEth: false },
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;
  const { clearAmount, setAmount } = useAmountControls(form);

  const watchedAsset = watch("asset");
  const watchedAsEth = watch("asEth");
  const { pickerValue, onPickerChange } = useEthAssetPicker(setValue, watchedAsset, watchedAsEth);
  const selected = findAsset(assets, watchedAsset);

  const amount = useDepositAmount(selected, { asEth: watchedAsEth, input: watch("amount") });
  const setup = useDepositSetup(selected?.id, { asEth: watchedAsEth, total: amount.total });
  const submitDisabled = !amount.validation.valid || setup.blocked;
  const clearFinished = useClearFinishedOp(m, progress);
  const pendingAmountBase =
    selected && amount.parsed !== undefined ? amount.parsed * selected.scale : undefined;

  const onSubmit = handleSubmit(
    useSubmitOnce(async (values) => {
      if (!selected) return;
      // Named apart from the `amount` state above, which is the whole
      // amount-and-fee view rather than the figure being sent.
      const circuitAmount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
      await m.mutateAsync({ amount: circuitAmount, asset: selected.id, asEth: values.asEth });
      clearAmount();
    }),
  );

  return (
    <ActionForm
      submitLabel="deposit"
      busy={m.isPending}
      // A failed allowance probe is reported by `SetupNotice`, which states the
      // real reason and offers the way out. Routing it here instead would run
      // it through `friendlyMessage`, whose keyword match turns a failed
      // `allowance` read into "approval missing" and hides the actual fault.
      error={m.error}
      onSubmit={onSubmit}
      submitDisabled={submitDisabled}
      progress={progress}
      txHash={m.data?.txHash}
    >
      <AssetPicker
        showEth
        value={pickerValue}
        onChange={(next) => {
          clearFinished();
          onPickerChange(next);
        }}
        error={errors.asset?.message}
      />
      <input type="hidden" {...register("asset")} />
      <input type="hidden" {...register("asEth")} />
      <AmountField
        inputProps={register("amount")}
        selected={selected}
        maxAmount={amount.maxAmount}
        validation={amount.validation}
        formError={errors.amount?.message}
        hint={depositHint(selected, watchedAsEth, amount.sourceBalance, amount.fee)}
        amount={amount.parsed}
        onSetMax={setAmount}
      />
      {/* Without this the form is simply dead: an unreadable fee leaves the
          amount unvalidatable, and nothing retries it. See `feeFailed`. */}
      {amount.feeFailed && amount.parsed !== undefined ? (
        <Notice title="Can't read the network fee" actionLabel="retry" onAction={amount.retryFee}>
          The deposit can't be checked against your balance until it loads.
        </Notice>
      ) : null}
      {setup.applicable && selected ? (
        <>
          {setup.needs.needsSetup || setup.unknown ? (
            <SetupNotice
              asset={selected}
              needsErc20Approve={setup.needs.needsErc20Approve}
              unknown={setup.unknown}
              onRun={setup.show}
            />
          ) : null}
          {setup.open ? (
            <SetupFlow
              asset={selected}
              pendingAmountBase={pendingAmountBase}
              needsErc20Approve={setup.needs.needsErc20Approve}
              onSuccess={setup.complete}
              onCancel={setup.dismiss}
            />
          ) : null}
        </>
      ) : null}
    </ActionForm>
  );
}

function depositHint(
  selected: RegisteredAsset | undefined,
  asEth: boolean,
  sourceBalance: bigint | undefined,
  fee: FeeBreakdown | undefined,
): string | undefined {
  if (!selected) return undefined;
  const mode = asEth ? "wraps ETH → WETH then deposits" : `${selected.symbol} via Permit2`;
  // The source balance is the public wallet's, already in base units — format
  // by the token's decimals alone, without the circuit-units scale.
  const sym = asEth ? "ETH" : selected.symbol;
  const balance =
    sourceBalance === undefined
      ? undefined
      : `balance ${formatDecimalCompact(sourceBalance, asEth ? 18 : selected.decimals)} ${sym}`;
  // The fee is charged on top of a deposit, so the figure worth stating is the
  // total leaving the wallet.
  return joinHint(mode, balance, feeLine(fee, selected, "total"));
}
