import { useCallback, useMemo } from "react";
import {
  AssetPicker,
  DEFAULT_ASSET_ID,
  type RegisteredAsset,
  useEthAssetPicker,
} from "@/features/assets";
import { SetupFlow, SetupNotice, useDepositSetup } from "@/features/onboarding";
import { DISPLAY_FRAC_DIGITS, formatDecimalCompact } from "@/shared/lib/format";
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

  // The whole amount-and-fee view, not the figure being sent.
  const amount = useDepositAmount(selected, { asEth: watchedAsEth, input: watch("amount") });
  const setup = useDepositSetup(selected, { asEth: watchedAsEth, total: amount.total });
  // No `onFeeAsset`: a deposit's relayer note is minted in the deposited asset
  // (`resolveDepositFee`), so there is no choice to offer.
  const fees = useFeePanel({
    kind: "deposit",
    selected,
    amount: amount.parsed,
    // The displayed figure rather than the one gating the submit: the panel
    // keeps the last amount's fee on screen while the next is priced.
    protocol: amount.feeShown,
    protocolPending: amount.feePending,
  });
  const submitDisabled = !amount.validation.valid || setup.blocked;
  // What the run will do, not what gates the deposit — see `SetupNeeds`.
  const setupErc20 = setup.needs.willApproveErc20;
  const willApproveErc20 = useCallback(() => setupErc20, [setupErc20]);
  const setupAssets = useMemo(() => (selected ? [selected] : []), [selected]);

  return (
    <ActionForm
      submitLabel="deposit"
      busy={m.isPending}
      // A failed allowance probe is reported by `SetupNotice`, which states the
      // reason and offers a remedy. Routing it here would run it through
      // `friendlyMessage`, whose keyword match turns a failed `allowance` read
      // into "approval missing" and hides the underlying fault.
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
      {/* Without this the form cannot proceed: an unreadable fee leaves the
          amount unvalidatable and nothing retries it. See `feeFailed`. */}
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
              willApproveErc20={setup.needs.willApproveErc20}
              unknown={setup.unknown}
              onRun={setup.show}
            />
          ) : null}
          {setup.open ? (
            <SetupFlow
              assets={setupAssets}
              willApproveErc20={willApproveErc20}
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
/// Fees are stated by `FeeSummary`, which has room to name the protocol and
/// relayer charges separately.
function depositHint(
  selected: RegisteredAsset | undefined,
  asEth: boolean,
  sourceBalance: bigint | undefined,
): string | undefined {
  if (!selected) return undefined;
  const mode = asEth ? "wraps ETH → WETH then deposits" : `${selected.symbol} via Permit2`;
  // The source balance is the public wallet's and already in base units, so it
  // is formatted by the token's decimals alone, without the circuit-unit scale.
  const sym = asEth ? "ETH" : selected.symbol;
  const balance =
    sourceBalance === undefined
      ? undefined
      : `balance ${formatDecimalCompact(sourceBalance, asEth ? 18 : selected.decimals, DISPLAY_FRAC_DIGITS)} ${sym}`;
  return joinHint(mode, balance);
}
