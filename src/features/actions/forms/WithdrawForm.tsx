import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/forms/ActionForm";
import { AmountField } from "@/features/actions/forms/AmountField";
import { NO_META, parseAmountSafe, validateAmount } from "@/features/actions/forms/amount-field";
import { balanceHint } from "@/features/actions/forms/balance-hint";
import { RecipientField } from "@/features/actions/forms/RecipientField";
import { type WithdrawInput, withdrawSchema } from "@/features/actions/forms/schemas";
import { useClearFinishedOp } from "@/features/actions/forms/use-clear-finished-op";
import { useWithdraw } from "@/features/actions/mutations";
import { type FeePreview, useFeePreview } from "@/features/actions/use-fee-preview";
import { AssetPicker } from "@/features/assets/AssetPicker";
import {
  DEFAULT_ASSET_ID,
  findAsset,
  useRegisteredAssets,
} from "@/features/assets/registered-assets";
import { useAssetBalance } from "@/features/assets/use-balances";
import { useEthAssetPicker } from "@/features/assets/use-eth-asset-picker";
import { SyncErrorNotice } from "@/features/wallet/SyncErrorNotice";
import { formatDecimalCompact, parseAmountForAsset } from "@/shared/lib/format";

export function WithdrawForm() {
  const { mutation: m, progress } = useWithdraw();
  const assets = useRegisteredAssets();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<WithdrawInput>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { to: "", amount: "", asset: DEFAULT_ASSET_ID, asEth: false },
  });
  const watchedAsset = watch("asset");
  const watchedAsEth = watch("asEth");
  const { pickerValue, onPickerChange } = useEthAssetPicker(setValue, watchedAsset, watchedAsEth);
  const selected = findAsset(assets, watchedAsset);
  const row = useAssetBalance(selected?.id);
  const balance = row?.balance;

  const parsed = parseAmountSafe(watch("amount"), selected);
  const v = validateAmount(parsed, selected, balance);
  const fee = useFeePreview(selected?.id, parsed, "withdraw");
  const submitDisabled = !v.valid;
  const clearFinished = useClearFinishedOp(m, progress);

  // No `dirtyFields.to` guard: it stood in for "the user has typed something",
  // which the pattern already implies — an empty field cannot match. It also
  // goes false when `onSubmit` resets the form while keeping the recipient,
  // which would drop the valid marker off an address that is still valid.
  const toValid = !errors.to && /^0x[0-9a-fA-F]{40}$/.test(watch("to"));

  const onSubmit = handleSubmit(async (values) => {
    if (!selected) return;
    const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
    await m.mutateAsync({
      amount,
      asset: selected.id,
      to: values.to,
      asEth: values.asEth,
    });
    // Not a bare `reset()`: that restores `defaultValues`, snapping the asset
    // picker back to id 1 and blanking the recipient the moment the tx is
    // broadcast — while the stepper is still advancing, so it reads as the
    // form clearing itself. The asset and `asEth` are a mode selection rather
    // than an entry, and the recipient is typically the same EOA every time.
    // Only the amount is dropped, so a completed withdraw is never one click
    // from being repeated.
    reset({ ...values, amount: "" });
  });

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
        valid={toValid}
        formError={errors.to?.message}
      />
      <AmountField
        inputProps={register("amount")}
        selected={selected}
        balance={balance}
        validation={v}
        formError={errors.amount?.message}
        hint={withdrawHint(
          balanceHint(balance, row?.pending ?? 0n, row?.outflow ?? 0n, selected ?? NO_META),
          selected,
          fee.data,
        )}
        onSetMax={(formatted) =>
          setValue("amount", formatted, { shouldDirty: true, shouldValidate: true })
        }
      />
    </ActionForm>
  );
}

/// Append a fee/net-receive line to the existing balance hint when the
/// preview is available. Withdraw fee is *deducted* from the gross
/// amount → recipient receives `total = inAmt - fee`.
function withdrawHint(
  base: string | undefined,
  selected: { symbol: string; decimals: number; scale: bigint } | undefined,
  fee?: FeePreview,
): string | undefined {
  if (!selected || !fee || fee.fee === 0n) return base;
  const fmt = (v: bigint) => formatDecimalCompact(v, selected.decimals);
  const bps = (Number(fee.feeBps) / 100).toFixed(2);
  const line = `fee ${fmt(fee.fee)} (${bps}%) · receive ${fmt(fee.total)} ${selected.symbol}`;
  return base ? `${base} · ${line}` : line;
}
