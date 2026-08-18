import { zodResolver } from "@hookform/resolvers/zod";
import { ADDRESS_HRP } from "@lelantos-org/sdk";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/forms/ActionForm";
import { AmountField } from "@/features/actions/forms/AmountField";
import { NO_META, parseAmountSafe, validateAmount } from "@/features/actions/forms/amount-field";
import { balanceHint } from "@/features/actions/forms/balance-hint";
import { RecipientField } from "@/features/actions/forms/RecipientField";
import { type TransferInput, transferSchema } from "@/features/actions/forms/schemas";
import { useClearFinishedOp } from "@/features/actions/forms/use-clear-finished-op";
import { useSubmitOnce } from "@/features/actions/forms/use-submit-once";
import { useTransfer } from "@/features/actions/mutations";
import { AssetSelectField } from "@/features/assets/AssetSelectField";
import {
  DEFAULT_ASSET_ID,
  findAsset,
  useRegisteredAssets,
} from "@/features/assets/registered-assets";
import { useAssetBalance } from "@/features/assets/use-balances";
import { SyncErrorNotice } from "@/features/wallet/SyncErrorNotice";
import { parseAmountForAsset } from "@/shared/lib/format";

export function TransferForm() {
  const { mutation: m, progress } = useTransfer();
  const assets = useRegisteredAssets();
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TransferInput>({
    resolver: zodResolver(transferSchema),
    defaultValues: { to: "", amount: "", asset: DEFAULT_ASSET_ID },
  });
  const selected = findAsset(assets, watch("asset"));
  const row = useAssetBalance(selected?.id);
  const balance = row?.balance;

  const parsed = parseAmountSafe(watch("amount"), selected);
  const v = validateAmount(parsed, selected, balance);
  const submitDisabled = !v.valid;

  // See `WithdrawForm`: the prefix test already implies a non-empty field, and
  // `dirtyFields.to` goes false across the post-submit reset.
  const toValid = !errors.to && watch("to").startsWith(`${ADDRESS_HRP}1`);

  const clearFinished = useClearFinishedOp(m, progress);
  const assetField = register("asset");

  const onSubmit = handleSubmit(
    useSubmitOnce(async (values) => {
      if (!selected) return;
      const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
      await m.mutateAsync({ amount, asset: selected.id, to: values.to });
      // Amount only — see `WithdrawForm` for why the asset and recipient stay.
      // From `getValues()` rather than the submitted snapshot: neither field is
      // disabled while the tx is in flight, and rolling back an edit made
      // during that window is not a reset the user asked for.
      reset({ ...getValues(), amount: "" });
    }),
  );

  return (
    <ActionForm
      submitLabel="transfer"
      busy={m.isPending}
      error={m.error}
      onSubmit={onSubmit}
      submitDisabled={submitDisabled}
      progress={progress}
      txHash={m.data?.txHash}
    >
      <SyncErrorNotice />
      <AssetSelectField
        error={errors.asset?.message}
        {...assetField}
        onChange={(e) => {
          clearFinished();
          return assetField.onChange(e);
        }}
      />
      <RecipientField
        inputProps={register("to")}
        label="recipient"
        placeholder={`${ADDRESS_HRP}1…`}
        valid={toValid}
        formError={errors.to?.message}
      />
      <AmountField
        inputProps={register("amount")}
        selected={selected}
        balance={balance}
        validation={v}
        formError={errors.amount?.message}
        hint={balanceHint(balance, row?.pending ?? 0n, row?.outflow ?? 0n, selected ?? NO_META)}
        onSetMax={(formatted) =>
          setValue("amount", formatted, { shouldDirty: true, shouldValidate: true })
        }
      />
    </ActionForm>
  );
}
