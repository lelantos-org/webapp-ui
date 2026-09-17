import { ADDRESS_HRP } from "@lelantos-org/sdk/primitives";
import { Link } from "react-router-dom";
import { z } from "zod";
import { DEFAULT_ASSET_ID, useAssetSelectOptions } from "@/features/assets";
import { FeeSummary } from "@/features/fees";
import {
  ActionForm,
  AmountHero,
  AssetSelectPill,
  amountField,
  BoundaryLine,
  defaultAssetField,
  isShieldedAddress,
  leavesBalanceLabel,
  MaxNotice,
  NO_META,
  RecipientField,
  ReviewPanel,
  SpendScreenHeader,
  shieldedAddressField,
  useActionForm,
  useSpendForm,
} from "@/features/op-form";
import { SyncNotice } from "@/features/wallet";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { useTransfer } from "./use-transfer";

/// The Send form's schema.
export const transferSchema = z.object({
  to: shieldedAddressField,
  amount: amountField,
  asset: defaultAssetField,
});
export type TransferInput = z.infer<typeof transferSchema>;

/// Send privately: a shielded transfer, reviewed before it is sent.
export function TransferForm() {
  const action = useTransfer();
  const form = useActionForm({
    schema: transferSchema,
    defaultValues: { to: "", amount: "", asset: DEFAULT_ASSET_ID },
    action,
  });
  const { register, setValue, errors, clearFinished } = form;
  const options = useAssetSelectOptions();
  const { spend, to, review, onPasteTo, frame, hero, reviewPanel } = useSpendForm(form, action, {
    kind: "transfer",
    recipient: { recipientValid: isShieldedAddress, recipientKind: "shielded" },
    titles: { progressTitle: "Sending privately", settledTitle: "Sent privately" },
    send: (values, ctx) =>
      action.mutation.mutateAsync({
        amount: ctx.amount,
        asset: ctx.asset,
        recipient: values.to,
        feeAsset: ctx.feeAsset,
      }),
  });

  return (
    <ActionForm
      {...frame}
      header={
        <SpendScreenHeader
          review={review}
          reviewSubtitle="Shielded pool → shielded address · stays off-chain"
        >
          <ScreenHeader
            title="Send privately"
            subtitle={
              <BoundaryLine
                sentence="Stays inside the shielded pool — nothing appears on-chain"
                short="Stays inside the pool"
              />
            }
          />
        </SpendScreenHeader>
      }
      review={
        reviewPanel ? (
          <ReviewPanel
            {...reviewPanel}
            destinationLabel="To this shielded address"
            destination={to}
            destinationNote="Check this against what the recipient gave you. Nothing on the receiving side will confirm it."
            fees={
              <FeeSummary
                variant="review"
                model={spend.fees.model}
                extraRows={[
                  {
                    label: "Leaves your balance",
                    value: leavesBalanceLabel(spend.fees.model),
                    strong: true,
                  },
                ]}
              />
            }
            warning="This cannot be reversed or cancelled once submitted, and no one can confirm receipt for you. A wrong address means the funds are gone."
            confirmLabel="Confirm and send"
          />
        ) : undefined
      }
    >
      <SyncNotice />
      <AmountHero
        {...hero}
        maxInfo={
          <MaxNotice spendable={spend.spendable} meta={spend.display ?? NO_META} verb="Sending" />
        }
        label="You send"
        asset={
          <AssetSelectPill
            label="Asset"
            options={options}
            value={form.watch("asset")}
            invalid={!!errors.asset}
            onChange={(next) => {
              clearFinished();
              setValue("asset", next, { shouldDirty: true });
            }}
          />
        }
      />
      <input type="hidden" {...register("asset")} />
      <hr className="rule" />
      <RecipientField
        inputProps={register("to")}
        label="To"
        placeholder={`${ADDRESS_HRP}1…`}
        value={to}
        isValid={isShieldedAddress}
        invalidMessage="That is not a shielded address"
        onPaste={onPasteTo}
        formError={errors.to?.message}
        helper="A shielded address. Ask the recipient for theirs — it never appears on-chain."
        extra={
          <p className="rcpt__extra">
            No shielded address?{" "}
            <Link to="/send/link" className="rcpt__link">
              Send by link →
            </Link>
          </p>
        }
      />
      <hr className="rule" />
    </ActionForm>
  );
}
