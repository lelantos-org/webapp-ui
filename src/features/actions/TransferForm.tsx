import { zodResolver } from "@hookform/resolvers/zod";
import { ADDRESS_HRP } from "@lelantos-org/sdk";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/ActionForm";
import { AmountField } from "@/features/actions/AmountField";
import { NO_META, parseAmountSafe, validateAmount } from "@/features/actions/amount-field";
import { balanceHint } from "@/features/actions/balance-hint";
import { RecipientField } from "@/features/actions/RecipientField";
import { useTransfer } from "@/features/actions/mutations";
import { type TransferInput, transferSchema } from "@/features/actions/schemas";
import { AssetSelectField } from "@/features/assets/AssetSelectField";
import { findAsset, useRegisteredAssets } from "@/features/assets/registered-assets";
import { useWalletState } from "@/features/wallet/use-wallet-state";
import { parseAmountForAsset } from "@/shared/lib/format";

export function TransferForm() {
  const { mutation: m, progress } = useTransfer();
  const balances = useWalletState().data?.balances ?? [];
  const assets = useRegisteredAssets();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<TransferInput>({
    resolver: zodResolver(transferSchema),
    defaultValues: { to: "", amount: "", asset: "1" },
  });
  const selected = findAsset(assets.data, watch("asset"));
  const row = selected ? balances.find((b) => b.asset === selected.id) : undefined;
  const balance = row?.balance;

  const parsed = parseAmountSafe(watch("amount"), selected);
  const v = validateAmount(parsed, selected, balance);
  const submitDisabled = !v.valid;

  const toValid = !errors.to && !!dirtyFields.to && watch("to").startsWith(`${ADDRESS_HRP}1`);

  const onSubmit = handleSubmit(async (values) => {
    if (!selected) return;
    const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
    await m.mutateAsync({ amount, asset: selected.id, to: values.to });
    reset();
  });

  return (
    <ActionForm
      title="transfer"
      submitLabel="transfer"
      busy={m.isPending}
      error={m.error}
      onSubmit={onSubmit}
      submitDisabled={submitDisabled}
      progress={progress}
    >
      <AssetSelectField error={errors.asset?.message} {...register("asset")} />
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
