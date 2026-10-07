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
  leavesBalanceLabel,
  MaxNotice,
  MemoField,
  memoField,
  NO_META,
  RecipientField,
  ReviewPanel,
  SHIELDED_RECIPIENT,
  SpendNotices,
  SpendScreenHeader,
  shieldedAddressField,
  useActionForm,
  useSpendForm,
} from "@/features/op-form";
import { usePaymentRequest } from "@/features/payment-request";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { RequestNotice } from "./components/RequestNotice";
import { useTransfer } from "./use-transfer";

export const transferSchema = z.object({
  to: shieldedAddressField,
  amount: amountField,
  asset: defaultAssetField,
  memo: memoField.default(""),
});
export type TransferInput = z.infer<typeof transferSchema>;

const MEMO_NOTE =
  "Encrypted with the payment: only the recipient can read it. You will not be able to see it again after sending.";

/// Send privately: a shielded transfer, reviewed before it is sent.
export function TransferForm() {
  const action = useTransfer();
  const form = useActionForm({
    schema: transferSchema,
    defaultValues: { to: "", amount: "", asset: DEFAULT_ASSET_ID, memo: "" },
    action,
  });
  const { register, setValue, setAmount, errors, clearFinished } = form;
  const options = useAssetSelectOptions();
  const request = usePaymentRequest((asked) => {
    setValue("to", asked.to, { shouldDirty: true, shouldValidate: true });
    // A recipient-only request: the asset, the amount and the memo stay the payer's.
    if (!("asset" in asked)) return;
    // Dirty, so the form's opening-asset default leaves the requested asset alone.
    setValue("asset", asked.asset.toString(), { shouldDirty: true });
    setValue("memo", asked.memo ?? "");
    setAmount(asked.amount);
  });
  const memo = form.watch("memo");
  const { spend, to, review, onPasteTo, frame, hero, reviewPanel } = useSpendForm(form, action, {
    kind: "transfer",
    recipient: SHIELDED_RECIPIENT,
    memo,
    titles: { progressTitle: "Sending privately", settledTitle: "Sent privately" },
    send: (values, ctx) =>
      action.mutation.mutateAsync({
        amount: ctx.amount,
        asset: ctx.asset,
        recipient: values.to,
        memo: values.memo || undefined,
        ...ctx.relayerFee,
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
            destinationNote="Ask the recipient for the fingerprint of their address: it is on their home screen, and on their handle's page. If it differs from this one, the address is not theirs. Nothing on the receiving side will confirm it."
            memo={memo}
            memoNote={MEMO_NOTE}
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
      <SpendNotices />
      <RequestNotice state={request} />
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
        rule={SHIELDED_RECIPIENT}
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
      <MemoField
        inputProps={register("memo")}
        label="Memo (optional)"
        value={memo}
        helper={MEMO_NOTE}
      />
      <hr className="rule" />
    </ActionForm>
  );
}
