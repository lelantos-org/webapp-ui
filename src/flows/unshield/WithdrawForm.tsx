import { z } from "zod";
import {
  DEFAULT_ASSET_ID,
  nativeEthView,
  useAssetSelectOptions,
  useEthAssetField,
} from "@/features/assets";
import { FeeSummary } from "@/features/fees";
import {
  ActionForm,
  AmountHero,
  AssetSelectPill,
  amountField,
  asEthField,
  BoundaryLine,
  defaultAssetField,
  evmAddressField,
  headlineLabel,
  isEvmAddress,
  leavesBalanceLabel,
  MaxNotice,
  NO_META,
  RecipientField,
  ReviewPanel,
  SpendScreenHeader,
  useActionForm,
  useSpendForm,
} from "@/features/op-form";
import { SyncNotice, useWallet } from "@/features/wallet";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { DenominationField } from "./denominations/DenominationField";
import { useLadder } from "./denominations/use-ladder";
import { ObserverPanel } from "./observer/ObserverPanel";
import { isSelfWithdraw, observerFacts, observerOutro } from "./observer/observer";
import { useWithdraw } from "./use-withdraw";

/// The Unshield form's schema.
export const withdrawSchema = z.object({
  to: evmAddressField,
  amount: amountField,
  asset: defaultAssetField,
  asEth: asEthField,
});
export type WithdrawInput = z.infer<typeof withdrawSchema>;

/// Unshield: shielded notes out to a public address, reviewed before it is sent.
export function WithdrawForm() {
  const { ethAddress } = useWallet();
  const action = useWithdraw();
  const { mutation: m, progress } = action;
  const form = useActionForm({
    schema: withdrawSchema,
    defaultValues: { to: "", amount: "", asset: DEFAULT_ASSET_ID, asEth: false },
    action,
  });
  const { register, errors, selected, setAmount, clearFinished } = form;
  const eth = useEthAssetField(form);
  const options = useAssetSelectOptions({ showEth: true });

  const { spend, to, symbol, review, onPasteTo, frame, hero, reviewPanel } = useSpendForm(
    form,
    action,
    {
      kind: "withdraw",
      protocolFee: true,
      spendSymbol: nativeEthView(selected, eth.asEth).spendSymbol,
      native: eth.asEth,
      recipient: { recipientValid: isEvmAddress, recipientKind: "public" },
      titles: { progressTitle: "Unshielding", settledTitle: "Unshielded" },
      send: (values, ctx) =>
        m.mutateAsync({
          gross: ctx.amount,
          asset: ctx.asset,
          recipient: values.to,
          native: values.asEth,
          feeAsset: ctx.feeAsset,
        }),
    },
  );
  const { parsed, display, spendable } = spend;

  // Bounded by the max: a denomination the selector would refuse is a failed spend.
  const ladder = useLadder({ selected: display, amount: parsed, max: spendable?.max });

  const selfWithdraw = isSelfWithdraw(to, ethAddress);
  const observer = observerFacts({
    to,
    asset: selected,
    amount: parsed,
    symbol,
  });
  const observerPanel = (variant: "full" | "compact") => (
    <ObserverPanel
      variant={variant}
      destination={observer.destination}
      amount={observer.amount}
      outro={observerOutro({
        verdict: ladder.verdict,
        figure: observer.figure,
        compact: variant === "compact",
      })}
    />
  );
  const showObserver = !review.open && !m.isPending && progress.steps.length === 0 && !m.error;

  return (
    <ActionForm
      {...frame}
      header={
        <SpendScreenHeader
          review={review}
          reviewSubtitle="Shielded pool → a public address · this part is visible"
        >
          <ScreenHeader
            title="Unshield"
            subtitle={
              <BoundaryLine
                from="Shielded pool"
                to="A public address — this part is visible on-chain"
                shielded="from"
                short="Shielded pool → a public address"
              />
            }
          />
        </SpendScreenHeader>
      }
      after={showObserver ? observerPanel("full") : undefined}
      review={
        reviewPanel ? (
          <ReviewPanel
            {...reviewPanel}
            destinationLabel="To this public address"
            destination={to}
            destinationNote="This address is public. Anything sent here is visible on-chain from now on."
            fees={
              <FeeSummary
                variant="review"
                model={spend.fees.model}
                extraRows={[
                  { label: "Leaves your balance", value: leavesBalanceLabel(spend.fees.model) },
                  { label: "They receive", value: headlineLabel(spend.fees.model), strong: true },
                ]}
              />
            }
            observer={observerPanel("compact")}
            warning={
              selfWithdraw
                ? "This cannot be reversed, and the destination is the account you're connected with — anyone can match your incoming funds to this withdrawal."
                : "This cannot be reversed. The destination is not the account you're connected with — keep the two sides unlinked by not reusing it."
            }
            confirmLabel="Confirm and unshield"
          />
        ) : undefined
      }
    >
      <SyncNotice />
      <input type="hidden" {...register("asset")} />
      <input type="hidden" {...register("asEth")} />
      <AmountHero
        {...hero}
        maxInfo={<MaxNotice spendable={spendable} meta={display ?? NO_META} verb="Unshielding" />}
        label="You unshield"
        asset={
          <AssetSelectPill
            label="Asset"
            options={options}
            value={eth.pickerValue}
            invalid={!!errors.asset}
            onChange={(next) => {
              clearFinished();
              eth.onPickerChange(next);
            }}
          />
        }
      />
      <hr className="rule" />
      <RecipientField
        inputProps={register("to")}
        label="To public address"
        placeholder="0x…"
        value={to}
        isValid={isEvmAddress}
        invalidMessage="That is not a valid public address"
        onPaste={onPasteTo}
        formError={errors.to?.message}
      />
      {selfWithdraw ? (
        <Notice tone="warn" title="This is the account you're connected with">
          Unshielding here puts the same address on both sides of the pool, so anyone can match your
          incoming funds to this withdrawal. Use a different address to keep them unlinked.
        </Notice>
      ) : null}
      {ladder.notice ? (
        <>
          <hr className="rule" />
          {/* `setAmount`, not `onSetMax`: `useFollowMax` would drift a picked denomination off the ladder. */}
          <DenominationField model={ladder} onPick={(d) => setAmount(d.text)} />
        </>
      ) : null}
      <hr className="rule" />
    </ActionForm>
  );
}
