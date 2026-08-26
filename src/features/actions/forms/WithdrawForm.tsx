import { useState } from "react";
import {
  AssetPicker,
  DEFAULT_ASSET_ID,
  useAssetBalance,
  useAssetBalanceLabel,
  useEthAssetPicker,
} from "@/features/assets";
import { SyncErrorNotice, useSpendableMax } from "@/features/wallet";
import { useWithdraw } from "../mutations";
import { useFeePreview } from "../use-fee-preview";
import { ActionForm } from "./ActionForm";
import { AmountField } from "./AmountField";
import { NO_META, parseAmountSafe, validateAmount } from "./amount-field";
import { balanceHint, withheldHint } from "./balance-hint";
import { FeeSummary } from "./FeeSummary";
import { feeIncoming, joinHint, shownFee } from "./fee-hint";
import { RecipientField } from "./RecipientField";
import { isEvmAddress, type WithdrawInput, withdrawSchema } from "./schemas";
import { useActionForm } from "./use-action-form";
import { useFeePanel } from "./use-fee-panel";
import { useFollowMax } from "./use-follow-max";

export function WithdrawForm() {
  const action = useWithdraw();
  const { mutation: m, progress } = action;
  const { register, watch, setValue, errors, selected, setAmount, clearFinished, onSubmit } =
    useActionForm<WithdrawInput, Parameters<typeof m.mutateAsync>[0], unknown>({
      schema: withdrawSchema,
      defaultValues: { to: "", amount: "", asset: DEFAULT_ASSET_ID, asEth: false },
      action,
      send: (values, { asset, amount }) =>
        m.mutateAsync({
          amount,
          asset: asset.id,
          to: values.to,
          asEth: values.asEth,
          // Ignored on the native path, which has no `feeAsset`; see
          // `WithdrawEthRequest`.
          feeAsset,
        }),
    });

  const watchedAsEth = watch("asEth");
  const { pickerValue, onPickerChange } = useEthAssetPicker(setValue, watch("asset"), watchedAsEth);
  const row = useAssetBalance(selected?.id);
  const balance = row?.balance;
  const balanceOf = useAssetBalanceLabel();

  const parsed = parseAmountSafe(watch("amount"), selected);
  const v = validateAmount(parsed, selected, balance);
  const fee = useFeePreview(selected?.id, parsed, "withdraw");

  const [feeAsset, setFeeAsset] = useState<bigint | undefined>(undefined);
  const fees = useFeePanel({
    kind: "withdraw",
    selected,
    amount: parsed,
    // The displayed figure, which may be held over from the previous amount while
    // the next is priced. It does not gate the submit: a withdraw's protocol fee
    // comes off `publicOut` rather than the cover.
    protocol: shownFee(fee),
    protocolPending: feeIncoming(fee),
    feeAsset,
    // Withheld on the native path: `withdrawEth` takes no `feeAsset`, so the
    // choice would be dropped rather than applied.
    onFeeAsset: watchedAsEth ? undefined : setFeeAsset,
  });

  // As in `TransferForm`, the balance overstates what a spend can cover. A
  // withdraw's protocol fee is deducted from `publicOut` rather than taken from
  // the spend's cover, so only the relayer fee reserves value here.
  const crossAssetFee = feeAsset !== undefined && feeAsset !== selected?.id;
  const spendable = useSpendableMax(selected?.id, {
    crossAssetFee,
    sameAssetFee: crossAssetFee ? 0n : fees.relayerAmount,
  });

  // Switching the fee asset moves the ceiling, so a figure written before that
  // change must move with it. See `use-follow-max.ts`.
  const { onSetMax } = useFollowMax(spendable?.max, selected, watch("amount"), setAmount);

  return (
    <ActionForm
      submitLabel="withdraw"
      busy={m.isPending}
      error={m.error}
      onSubmit={onSubmit}
      submitDisabled={!v.valid}
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
        maxAmount={spendable?.max}
        validation={v}
        formError={errors.amount?.message}
        hint={joinHint(
          balanceHint(balance, row?.pending ?? 0n, row?.outflow ?? 0n, selected ?? NO_META),
          withheldHint(spendable, selected ?? NO_META),
        )}
        amount={parsed}
        onSetMax={onSetMax}
      />
      <FeeSummary model={fees.model} refreshing={fees.refreshing} feeAsset={fees.feeAsset} />
    </ActionForm>
  );
}
