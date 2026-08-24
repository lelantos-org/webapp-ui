import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/forms/ActionForm";
import { AmountField } from "@/features/actions/forms/AmountField";
import { NO_META, parseAmountSafe, validateAmount } from "@/features/actions/forms/amount-field";
import { balanceHint } from "@/features/actions/forms/balance-hint";
import { feeLine, joinHint, settledFee } from "@/features/actions/forms/fee-hint";
import { RecipientField } from "@/features/actions/forms/RecipientField";
import { isEvmAddress, type WithdrawInput, withdrawSchema } from "@/features/actions/forms/schemas";
import { useAmountControls } from "@/features/actions/forms/use-amount-controls";
import { useClearFinishedOp } from "@/features/actions/forms/use-clear-finished-op";
import { useSubmitOnce } from "@/features/actions/forms/use-submit-once";
import { useWithdraw } from "@/features/actions/mutations";
import { useFeePreview } from "@/features/actions/use-fee-preview";
import { AssetPicker } from "@/features/assets/AssetPicker";
import {
  DEFAULT_ASSET_ID,
  findAsset,
  useRegisteredAssets,
} from "@/features/assets/registered-assets";
import { useAssetBalance, useAssetBalanceLabel } from "@/features/assets/use-balances";
import { useEthAssetPicker } from "@/features/assets/use-eth-asset-picker";
import { SyncErrorNotice } from "@/features/wallet/SyncErrorNotice";
import { parseAmountForAsset } from "@/shared/lib/format";

export function WithdrawForm() {
  const { mutation: m, progress } = useWithdraw();
  const assets = useRegisteredAssets();
  const form = useForm<WithdrawInput>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { to: "", amount: "", asset: DEFAULT_ASSET_ID, asEth: false },
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
  const row = useAssetBalance(selected?.id);
  const balance = row?.balance;
  const balanceOf = useAssetBalanceLabel();

  const parsed = parseAmountSafe(watch("amount"), selected);
  const v = validateAmount(parsed, selected, balance);
  const fee = useFeePreview(selected?.id, parsed, "withdraw");
  const submitDisabled = !v.valid;
  const clearFinished = useClearFinishedOp(m, progress);

  const onSubmit = handleSubmit(
    useSubmitOnce(async (values) => {
      if (!selected) return;
      const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
      await m.mutateAsync({
        amount,
        asset: selected.id,
        to: values.to,
        asEth: values.asEth,
      });
      clearAmount();
    }),
  );

  return (
    <ActionForm
      submitLabel="withdraw"
      busy={m.isPending}
      error={m.error}
      onSubmit={onSubmit}
      submitDisabled={submitDisabled}
      progress={progress}
      txHash={m.data?.txHash}
    >
      <SyncErrorNotice />
      <AssetPicker
        showEth
        balanceOf={balanceOf}
        value={pickerValue}
        onChange={(next) => {
          clearFinished();
          onPickerChange(next);
        }}
        error={errors.asset?.message}
      />
      <input type="hidden" {...register("asset")} />
      <input type="hidden" {...register("asEth")} />
      <RecipientField
        inputProps={register("to")}
        label="recipient (0x)"
        placeholder="0x…"
        value={watch("to")}
        isValid={isEvmAddress}
        onPaste={(to) => setValue("to", to, { shouldDirty: true, shouldValidate: true })}
        formError={errors.to?.message}
      />
      <AmountField
        inputProps={register("amount")}
        selected={selected}
        maxAmount={balance}
        validation={v}
        formError={errors.amount?.message}
        hint={joinHint(
          balanceHint(balance, row?.pending ?? 0n, row?.outflow ?? 0n, selected ?? NO_META),
          // Deducted from the gross amount, so the figure worth stating is what
          // the recipient actually receives.
          feeLine(settledFee(fee), selected, "receive"),
        )}
        amount={parsed}
        onSetMax={setAmount}
      />
    </ActionForm>
  );
}
