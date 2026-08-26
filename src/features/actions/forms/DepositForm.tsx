import { useCallback, useMemo } from "react";
import {
  AssetPicker,
  DEFAULT_ASSET_ID,
  type RegisteredAsset,
  useEthAssetPicker,
} from "@/features/assets";
import { SetupFlow, SetupNotice, useDepositSetup } from "@/features/onboarding";
import { formatDecimalCompact } from "@/shared/lib/format";
import { Notice } from "@/shared/ui/Notice";
import { useDeposit } from "../mutations";
import { ActionForm } from "./ActionForm";
import { AmountField } from "./AmountField";
import { FeeSummary } from "./FeeSummary";
import { joinHint } from "./fee-hint";
import { type DepositInput, depositSchema } from "./schemas";
import { useActionForm } from "./use-action-form";
import { useDepositAmount } from "./use-deposit-amount";
import { useFeePanel } from "./use-fee-panel";

export function DepositForm() {
  const action = useDeposit();
  const { mutation: m, progress } = action;
  const { register, watch, setValue, errors, selected, setAmount, clearFinished, onSubmit } =
    useActionForm<DepositInput, Parameters<typeof m.mutateAsync>[0], unknown>({
      schema: depositSchema,
      defaultValues: { amount: "", asset: DEFAULT_ASSET_ID, asEth: false },
      action,
      send: (values, { asset, amount }) =>
        m.mutateAsync({ amount, asset: asset.id, asEth: values.asEth }),
    });

  const watchedAsEth = watch("asEth");
  const { pickerValue, onPickerChange } = useEthAssetPicker(setValue, watch("asset"), watchedAsEth);

  // `amount` here is the whole amount-and-fee view, not the figure being sent.
  const amount = useDepositAmount(selected, { asEth: watchedAsEth, input: watch("amount") });
  const setup = useDepositSetup(selected?.id, { asEth: watchedAsEth, total: amount.total });
  // No `onFeeAsset`: a deposit's relayer note is minted in the deposited asset
  // (`resolveDepositFee`), so there is nothing to choose.
  const fees = useFeePanel({
    kind: "deposit",
    selected,
    amount: amount.parsed,
    // The displayed figure, not the one the submit is gated on: the panel
    // keeps the last amount's fee on screen while the next is priced rather
    // than blanking on every keystroke.
    protocol: amount.feeShown,
    protocolPending: amount.feePending,
  });
  const submitDisabled = !amount.validation.valid || setup.blocked;
  const setupErc20 = setup.needs.needsErc20Approve;
  const needsErc20Approve = useCallback(() => setupErc20, [setupErc20]);
  const setupAssets = useMemo(() => (selected ? [selected] : []), [selected]);

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
      <AmountField
        inputProps={register("amount")}
        selected={selected}
        maxAmount={amount.maxAmount}
        validation={amount.validation}
        formError={errors.amount?.message}
        hint={depositHint(selected, watchedAsEth, amount.sourceBalance)}
        amount={amount.parsed}
        onSetMax={setAmount}
      />
      <FeeSummary model={fees.model} refreshing={fees.refreshing} />
      {/* Without this the form is simply dead: an unreadable fee leaves the
          amount unvalidatable, and nothing retries it. See `feeFailed`. */}
      {amount.feeFailed && amount.parsed !== undefined ? (
        <Notice title="Can't read the network fee" actionLabel="retry" onAction={amount.retryFee}>
          The deposit can't be checked against your balance until it loads.
        </Notice>
      ) : null}
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
              assets={setupAssets}
              needsErc20Approve={needsErc20Approve}
              onSuccess={setup.complete}
              onCancel={setup.dismiss}
            />
          ) : null}
        </>
      ) : null}
    </ActionForm>
  );
}

/// The mode-and-balance line under the amount field.
///
/// Fees used to ride here too. They moved to `FeeSummary`, which has room to
/// name both of them and to say which is which — a deposit is charged the
/// protocol fee *and* the relayer's, and one figure could not carry that.
function depositHint(
  selected: RegisteredAsset | undefined,
  asEth: boolean,
  sourceBalance: bigint | undefined,
): string | undefined {
  if (!selected) return undefined;
  const mode = asEth ? "wraps ETH → WETH then deposits" : `${selected.symbol} via Permit2`;
  // The source balance is the public wallet's, already in base units — format
  // by the token's decimals alone, without the circuit-units scale.
  const sym = asEth ? "ETH" : selected.symbol;
  const balance =
    sourceBalance === undefined
      ? undefined
      : `balance ${formatDecimalCompact(sourceBalance, asEth ? 18 : selected.decimals)} ${sym}`;
  return joinHint(mode, balance);
}
