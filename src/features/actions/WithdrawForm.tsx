import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/ActionForm";
import { AmountField } from "@/features/actions/AmountField";
import { NO_META, parseAmountSafe, validateAmount } from "@/features/actions/amount-field";
import { balanceHint } from "@/features/actions/balance-hint";
import { RecipientField } from "@/features/actions/RecipientField";
import { useWithdraw } from "@/features/actions/mutations";
import { type WithdrawInput, withdrawSchema } from "@/features/actions/schemas";
import { type FeePreview, useFeePreview } from "@/features/actions/use-fee-preview";
import { AssetPicker } from "@/features/assets/AssetPicker";
import { findAsset, useRegisteredAssets } from "@/features/assets/registered-assets";
import { useEthAssetPicker } from "@/features/assets/use-eth-asset-picker";
import { useWalletState } from "@/features/wallet/use-wallet-state";
import { formatDecimal, parseAmountForAsset } from "@/shared/lib/format";

export function WithdrawForm() {
  const { mutation: m, progress } = useWithdraw();
  const balances = useWalletState().data?.balances ?? [];
  const assets = useRegisteredAssets();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<WithdrawInput>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { to: "", amount: "", asset: "1", asEth: false },
  });
  const watchedAsset = watch("asset");
  const watchedAsEth = watch("asEth");
  const { pickerValue, onPickerChange } = useEthAssetPicker(setValue, watchedAsset, watchedAsEth);
  const selected = findAsset(assets.data, watchedAsset);
  const row = selected ? balances.find((b) => b.asset === selected.id) : undefined;
  const balance = row?.balance;

  const parsed = parseAmountSafe(watch("amount"), selected);
  const v = validateAmount(parsed, selected, balance);
  const fee = useFeePreview(selected?.id, parsed, "withdraw");
  const submitDisabled = !v.valid;

  const toValid = !errors.to && !!dirtyFields.to && /^0x[0-9a-fA-F]{40}$/.test(watch("to"));

  const onSubmit = handleSubmit(async (values) => {
    if (!selected) return;
    const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
    await m.mutateAsync({
      amount,
      asset: selected.id,
      to: values.to,
      asEth: values.asEth,
    });
    reset();
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
      <AssetPicker
        showEth
        value={pickerValue}
        onChange={onPickerChange}
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
  const fmt = (v: bigint) => formatDecimal(v, selected.decimals);
  const bps = (Number(fee.feeBps) / 100).toFixed(2);
  const line = `fee ${fmt(fee.fee)} (${bps}%) · receive ${fmt(fee.total)} ${selected.symbol}`;
  return base ? `${base} · ${line}` : line;
}
