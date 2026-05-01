import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/ActionForm";
import { parseAmountSafe, pickAmountError, validateAmount } from "@/features/actions/amount-field";
import { useDeposit } from "@/features/actions/mutations";
import { type DepositInput, depositSchema } from "@/features/actions/schemas";
import { useFeePreview } from "@/features/actions/use-fee-preview";
import { AssetPicker } from "@/features/assets/AssetPicker";
import { findAsset, useRegisteredAssets } from "@/features/assets/registered-assets";
import { useEthAssetPicker } from "@/features/assets/use-eth-asset-picker";
import { SetupFlow } from "@/features/onboarding/SetupFlow";
import { useSetupStatus } from "@/features/onboarding/use-setup-status";
import { formatDecimal, parseAmountForAsset } from "@/shared/lib/format";
import { TextField } from "@/shared/ui/Field";

export function DepositForm() {
  const { mutation: m, progress } = useDeposit();
  const assets = useRegisteredAssets();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DepositInput>({
    resolver: zodResolver(depositSchema),
    defaultValues: { amount: "", asset: "1", asEth: false },
  });

  const watchedAsset = watch("asset");
  const watchedAsEth = watch("asEth");
  const { pickerValue, onPickerChange } = useEthAssetPicker(setValue, watchedAsset, watchedAsEth);
  const selected = findAsset(assets.data, watchedAsset);

  const parsed = parseAmountSafe(watch("amount"), selected);
  const v = validateAmount(parsed, selected, undefined);
  const fee = useFeePreview(selected?.id, parsed);
  const setup = useSetupStatus(selected?.id, { asEth: watchedAsEth });
  const needsSetup =
    !!setup.data && (setup.data.needsErc20Approve || setup.data.needsAllowancePermit);
  const submitDisabled = !v.valid || needsSetup;
  const pendingAmountBase = selected && parsed !== undefined ? parsed * selected.scale : undefined;
  const [setupOpen, setSetupOpen] = useState(false);
  useEffect(() => {
    if (needsSetup) setSetupOpen(true);
  }, [needsSetup]);

  const onSubmit = handleSubmit(async (values) => {
    if (!selected) return;
    const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
    await m.mutateAsync({ amount, asset: selected.id, asEth: values.asEth });
    reset();
  });

  return (
    <ActionForm
      submitLabel="deposit"
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
      <TextField
        label="amount"
        placeholder={selected ? `1.0 ${selected.symbol}` : "1.0"}
        inputMode="decimal"
        autoComplete="off"
        error={pickAmountError(errors.amount?.message, v)}
        hint={depositHint(selected, watchedAsEth, fee.data)}
        {...register("amount")}
      />
      {needsSetup && setupOpen && selected && !watchedAsEth && setup.data ? (
        <SetupFlow
          asset={selected}
          pendingAmountBase={pendingAmountBase}
          needsErc20Approve={setup.data.needsErc20Approve}
          onSuccess={() => {
            setSetupOpen(false);
            setup.refetch();
          }}
          onCancel={() => setSetupOpen(false)}
        />
      ) : null}
    </ActionForm>
  );
}

function depositHint(
  selected: { symbol: string; decimals: number; scale: bigint } | undefined,
  asEth: boolean,
  fee?: { inAmt: bigint; fee: bigint; total: bigint; feeBps: bigint },
): string | undefined {
  if (!selected) return undefined;
  const head = asEth ? "wraps ETH → WETH then deposits" : `${selected.symbol} via Permit2`;
  if (!fee || fee.fee === 0n) return head;
  // fee.{inAmt,fee,total} are in ERC20 base units → format by token decimals only.
  const fmt = (v: bigint) => formatDecimal(v, selected.decimals);
  const bps = (Number(fee.feeBps) / 100).toFixed(2);
  return `${head} · fee ${fmt(fee.fee)} (${bps}%) · total ${fmt(fee.total)} ${selected.symbol}`;
}
