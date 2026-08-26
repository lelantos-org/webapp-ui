import { ADDRESS_HRP } from "@lelantos-org/sdk";
import { useState } from "react";
import {
  AssetSelectField,
  DEFAULT_ASSET_ID,
  useAssetBalance,
  useAssetBalanceLabel,
} from "@/features/assets";
import { SyncErrorNotice, useSpendableMax } from "@/features/wallet";
import { useTransfer } from "../mutations";
import { ActionForm } from "./ActionForm";
import { AmountField } from "./AmountField";
import { NO_META, parseAmountSafe, validateAmount } from "./amount-field";
import { balanceHint, withheldHint } from "./balance-hint";
import { FeeSummary } from "./FeeSummary";
import { joinHint } from "./fee-hint";
import { RecipientField } from "./RecipientField";
import { isShieldedAddress, type TransferInput, transferSchema } from "./schemas";
import { useActionForm } from "./use-action-form";
import { useFeePanel } from "./use-fee-panel";
import { useFollowMax } from "./use-follow-max";

export function TransferForm() {
  const action = useTransfer();
  const { mutation: m, progress } = action;
  const { register, watch, setValue, errors, selected, setAmount, clearFinished, onSubmit } =
    useActionForm<TransferInput, Parameters<typeof m.mutateAsync>[0], unknown>({
      schema: transferSchema,
      defaultValues: { to: "", amount: "", asset: DEFAULT_ASSET_ID },
      action,
      send: (values, { asset, amount }) =>
        m.mutateAsync({ amount, asset: asset.id, to: values.to, feeAsset }),
    });

  const row = useAssetBalance(selected?.id);
  const balance = row?.balance;
  const balanceOf = useAssetBalanceLabel();

  const parsed = parseAmountSafe(watch("amount"), selected);
  const v = validateAmount(parsed, selected, balance);
  const assetField = register("asset");

  // Left unset until the user picks. `undefined` means the asset being sent,
  // which is the SDK's default and stays correct across asset changes.
  const [feeAsset, setFeeAsset] = useState<bigint | undefined>(undefined);
  const fees = useFeePanel({
    kind: "transfer",
    selected,
    amount: parsed,
    // A transfer has no transparent leg, so `MASP._takeFee` never runs.
    protocol: undefined,
    feeAsset,
    onFeeAsset: setFeeAsset,
  });

  // Not the balance: the selector refuses reserved, cooling-down and dust notes,
  // and a spend can consume only `nIn` of what remains, so a max wired to the
  // balance would write an amount the selector rejects. See `wallet/spendable.ts`.
  const crossAssetFee = feeAsset !== undefined && feeAsset !== selected?.id;
  const spendable = useSpendableMax(selected?.id, {
    crossAssetFee,
    // A same-asset relayer fee comes out of this spend's own target, so the most
    // that can be sent is the ceiling less the fee.
    sameAssetFee: crossAssetFee ? 0n : fees.relayerAmount,
  });

  // Switching the fee asset moves the ceiling, so a figure written before that
  // change must move with it. See `use-follow-max.ts`.
  const { onSetMax } = useFollowMax(spendable?.max, selected, watch("amount"), setAmount);

  return (
    <ActionForm
      submitLabel="transfer"
      busy={m.isPending}
      error={m.error}
      onSubmit={onSubmit}
      submitDisabled={!v.valid}
      progress={progress}
      txHash={m.data?.txHash}
    >
      <SyncErrorNotice />
      <AssetSelectField
        balanceOf={balanceOf}
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
        value={watch("to")}
        isValid={isShieldedAddress}
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
