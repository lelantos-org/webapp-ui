import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/forms/ActionForm";
import {
  parseAmountSafe,
  pickAmountError,
  validateDepositAmount,
} from "@/features/actions/forms/amount-field";
import { type DepositInput, depositSchema } from "@/features/actions/forms/schemas";
import { useClearFinishedOp } from "@/features/actions/forms/use-clear-finished-op";
import { useDeposit } from "@/features/actions/mutations";
import { useFeePreview } from "@/features/actions/use-fee-preview";
import { AssetPicker } from "@/features/assets/AssetPicker";
import {
  DEFAULT_ASSET_ID,
  findAsset,
  type RegisteredAsset,
  useRegisteredAssets,
} from "@/features/assets/registered-assets";
import { useDepositSourceBalance } from "@/features/assets/transparent-balances";
import { useEthAssetPicker } from "@/features/assets/use-eth-asset-picker";
import { SetupFlow } from "@/features/onboarding/SetupFlow";
import { SetupNotice } from "@/features/onboarding/SetupNotice";
import { useDepositSetup } from "@/features/onboarding/use-deposit-setup";
import type { FeeBreakdown } from "@/shared/lib/fees";
import { formatDecimalCompact, parseAmountForAsset } from "@/shared/lib/format";
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
    defaultValues: { amount: "", asset: DEFAULT_ASSET_ID, asEth: false },
  });

  const watchedAsset = watch("asset");
  const watchedAsEth = watch("asEth");
  const { pickerValue, onPickerChange } = useEthAssetPicker(setValue, watchedAsset, watchedAsEth);
  const selected = findAsset(assets, watchedAsset);

  const parsed = parseAmountSafe(watch("amount"), selected);
  const fee = useFeePreview(selected?.id, parsed);
  // Public wallet balance, not the shielded one: a deposit moves funds in.
  const sourceBalance = useDepositSourceBalance(selected?.id, watchedAsEth);
  // The preview is debounced, so between a keystroke and the fetch settling
  // `fee.data` describes the previous amount. Both readers below gate the
  // submit button, so a lagging total is treated as absent: the button stays
  // disabled through the window rather than accepting the fee for a different
  // amount.
  const feeTotal = fee.stale ? undefined : fee.data?.total;
  const v = validateDepositAmount(parsed, selected, sourceBalance, feeTotal);
  const setup = useDepositSetup(selected?.id, {
    asEth: watchedAsEth,
    total: feeTotal,
  });
  const submitDisabled = !v.valid || setup.blocked;
  const clearFinished = useClearFinishedOp(m, progress);
  const pendingAmountBase = selected && parsed !== undefined ? parsed * selected.scale : undefined;

  const onSubmit = handleSubmit(async (values) => {
    if (!selected) return;
    const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
    await m.mutateAsync({ amount, asset: selected.id, asEth: values.asEth });
    // Amount only — see `WithdrawForm` for why the asset and `asEth` stay.
    reset({ ...values, amount: "" });
  });

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
      <TextField
        label="amount"
        placeholder={selected ? `1.0 ${selected.symbol}` : "1.0"}
        inputMode="decimal"
        autoComplete="off"
        error={pickAmountError(errors.amount?.message, v)}
        hint={depositHint(selected, watchedAsEth, sourceBalance, fee.data)}
        {...register("amount")}
      />
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
  fee?: FeeBreakdown,
): string | undefined {
  if (!selected) return undefined;
  const mode = asEth ? "wraps ETH → WETH then deposits" : `${selected.symbol} via Permit2`;
  // Balances here are the public wallet's, already in base units — format by
  // the token's decimals alone, without the circuit-units scale.
  const sym = asEth ? "ETH" : selected.symbol;
  const head =
    sourceBalance === undefined
      ? mode
      : `${mode} · balance ${formatDecimalCompact(sourceBalance, asEth ? 18 : selected.decimals)} ${sym}`;
  if (!fee || fee.fee === 0n) return head;
  // fee.{inAmt,fee,total} are in ERC20 base units → format by token decimals only.
  const fmt = (v: bigint) => formatDecimalCompact(v, selected.decimals);
  const bps = (Number(fee.feeBps) / 100).toFixed(2);
  return `${head} · fee ${fmt(fee.fee)} (${bps}%) · total ${fmt(fee.total)} ${selected.symbol}`;
}
