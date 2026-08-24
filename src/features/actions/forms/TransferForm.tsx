import { zodResolver } from "@hookform/resolvers/zod";
import { ADDRESS_HRP } from "@lelantos-org/sdk";
import { useForm } from "react-hook-form";
import { ActionForm } from "@/features/actions/forms/ActionForm";
import { AmountField } from "@/features/actions/forms/AmountField";
import { NO_META, parseAmountSafe, validateAmount } from "@/features/actions/forms/amount-field";
import { balanceHint } from "@/features/actions/forms/balance-hint";
import { RecipientField } from "@/features/actions/forms/RecipientField";
import {
  isShieldedAddress,
  type TransferInput,
  transferSchema,
} from "@/features/actions/forms/schemas";
import { useAmountControls } from "@/features/actions/forms/use-amount-controls";
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
  const form = useForm<TransferInput>({
    resolver: zodResolver(transferSchema),
    defaultValues: { to: "", amount: "", asset: DEFAULT_ASSET_ID },
  });
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = form;
  const { clearAmount, setAmount } = useAmountControls(form);
  const selected = findAsset(assets, watch("asset"));
  const row = useAssetBalance(selected?.id);
  const balance = row?.balance;

  const parsed = parseAmountSafe(watch("amount"), selected);
  const v = validateAmount(parsed, selected, balance);
  const submitDisabled = !v.valid;

  // The schema's own check, not a looser prefix test: `errors.to` is empty
  // until the first submit, so a bare `startsWith` ticked the field green on a
  // half-typed address the form would then reject.
  //
  // No `dirtyFields.to` guard: it stood in for "the user has typed something",
  // which the check already implies — an empty field cannot pass. It also goes
  // false when `onSubmit` clears the amount while keeping the recipient, which
  // would drop the valid marker off an address that is still valid.
  const toValid = !errors.to && isShieldedAddress(watch("to"));

  const clearFinished = useClearFinishedOp(m, progress);
  const assetField = register("asset");

  const onSubmit = handleSubmit(
    useSubmitOnce(async (values) => {
      if (!selected) return;
      const amount = parseAmountForAsset(values.amount, selected.decimals, selected.scale);
      await m.mutateAsync({ amount, asset: selected.id, to: values.to });
      clearAmount();
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
        onSetMax={setAmount}
      />
    </ActionForm>
  );
}
