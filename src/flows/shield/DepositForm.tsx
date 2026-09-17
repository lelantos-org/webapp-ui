import { supportsAllowanceTransfer } from "@lelantos-org/sdk/advanced";
import { z } from "zod";
import {
  DEFAULT_ASSET_ID,
  nativeEthView,
  ShieldAssetPicker,
  useEthAssetField,
  useRegisteredAssets,
} from "@/features/assets";
import { FeeDetails, useFeePanel } from "@/features/fees";
import {
  ActionForm,
  AmountHero,
  AssetPill,
  amountField,
  asEthField,
  BoundaryLine,
  defaultAssetField,
  useActionForm,
  useActionSubmit,
} from "@/features/op-form";
import { useWallet, useWalletInstance } from "@/features/wallet";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { DepositAfter } from "./components/DepositAfter";
import { DepositFeeSummary } from "./components/DepositFeeSummary";
import { DepositUnavailable } from "./components/DepositUnavailable";
import { depositSubmitBlock } from "./deposit-block";
import {
  depositAmountError,
  depositFootnote,
  nativeMaxHint,
  shieldFigure,
  walletBalance,
} from "./deposit-copy";
import { SetupFlow } from "./setup/components/SetupFlow";
import { useDeposit } from "./use-deposit";
import { useDepositAmount } from "./use-deposit-amount";
import { useDepositSetup } from "./use-deposit-setup";
import { useReplacingScreen } from "./use-replacing-screen";

export const depositSchema = z.object({
  amount: amountField,
  asset: defaultAssetField,
  asEth: asEthField,
});
export type DepositInput = z.infer<typeof depositSchema>;

/// Shield screen, behind the wallet's deposit capability gate.
export function DepositForm() {
  const { capabilities } = useWallet();
  const verdict = capabilities.deposit;
  if (!verdict.allowed) {
    return (
      <>
        {HEADER}
        <DepositUnavailable reason={verdict.reason} />
      </>
    );
  }
  return <DepositFormInner />;
}

const HEADER = (
  <ScreenHeader
    title="Shield"
    subtitle={<BoundaryLine from="Public wallet" to="Shielded pool" shielded="to" />}
  />
);

const NATIVE_DECIMALS = 18;

function DepositFormInner() {
  const action = useDeposit();
  const { mutation: m, progress } = action;
  const wallet = useWalletInstance();
  const form = useActionForm({
    schema: depositSchema,
    defaultValues: { amount: "", asset: DEFAULT_ASSET_ID, asEth: false },
    action,
  });
  const { register, watch, errors, selected, setAmount, clearFinished } = form;
  const assets = useRegisteredAssets();
  const eth = useEthAssetField(form);
  const amountText = watch("amount");
  const { symbol, spendSymbol, address } = nativeEthView(selected, eth.asEth);

  const amount = useDepositAmount(selected, { asEth: eth.asEth, input: amountText });
  const setup = useDepositSetup({ asEth: eth.asEth, pulls: amount.pulls });
  const fees = useFeePanel({
    kind: "deposit",
    selected,
    amount: amount.parsed,
    protocol: amount.feeShown,
    protocolPending: amount.feePending,
    feeAsset: amount.feeAsset,
    onFeeAsset: eth.asEth ? undefined : amount.onFeeAsset,
    deposit: eth.asEth ? { asEth: true } : { asEth: false, principal: amount.principalTotal },
    spendSymbol,
  });

  const picker = useReplacingScreen<HTMLButtonElement>();

  const block = depositSubmitBlock({
    symbol,
    amountText,
    amount,
    setup: {
      applicable: setup.applicable,
      needsSetup: setup.needs.needsSetup,
      unknown: setup.unknown,
      blocked: setup.blocked,
      symbols: setup.assets.map((a) => a.symbol),
    },
    feeBlock: fees.block,
  });

  const onSubmit = useActionSubmit<DepositInput>(form, (values, ctx) =>
    m.mutateAsync({
      amount: ctx.amount,
      asset: ctx.asset.id,
      native: values.asEth,
      feeAsset: amount.feeAsset,
    }),
  );

  const figure = shieldFigure(selected, amount.parsed, symbol);

  return (
    <>
      <div hidden={picker.open}>
        <ActionForm
          header={HEADER}
          submitLabel={figure ? `Shield ${figure}` : "Shield"}
          busy={m.isPending}
          error={m.error}
          onSubmit={onSubmit}
          submitDisabled={block.disabled}
          blockedReason={block.reason}
          footnote={depositFootnote(
            eth.asEth,
            symbol,
            !!wallet && supportsAllowanceTransfer(wallet.chain),
            amount.separateFee?.symbol,
          )}
          progress={progress}
          txHash={m.data?.txHash}
          onReset={clearFinished}
          tx={{ progressTitle: "Shielding", settledTitle: "Shielded", amount: figure }}
          details={<FeeDetails fees={fees} summary={<DepositFeeSummary fees={fees} />} />}
          after={(view) =>
            view === "progress" ? null : (
              <DepositAfter selected={selected} symbol={symbol} asEth={eth.asEth} setup={setup} />
            )
          }
        >
          <AmountHero
            inputProps={register("amount")}
            label="You shield"
            selected={selected}
            value={amountText}
            amount={amount.parsed}
            wordsSymbol={symbol}
            asset={
              <AssetPill
                ref={picker.triggerRef}
                symbol={assets.length === 0 ? undefined : symbol}
                address={address}
                open={picker.open}
                aria-haspopup="false"
                aria-label={symbol ? `${symbol} — choose another asset` : "Choose an asset"}
                onClick={picker.show}
              />
            }
            balanceLabel="In your wallet"
            balanceLabelShort="Wallet"
            balance={walletBalance(
              amount.sourceBalance,
              eth.asEth ? NATIVE_DECIMALS : selected?.decimals,
              symbol,
            )}
            maxAmount={amount.maxAmount}
            onSetMax={setAmount}
            validation={amount.validation}
            formError={errors.amount?.message ?? depositAmountError(amount.validation)}
            hint={errors.asset?.message ?? nativeMaxHint(eth.asEth, amount.sourceBalance)}
          />
          <input type="hidden" {...register("asset")} />
          <input type="hidden" {...register("asEth")} />
          {amount.feeFailed && amount.parsed !== undefined ? (
            <Notice
              title="Couldn't read the network fee"
              actionLabel="Try again"
              actionPlacement="below"
              onAction={amount.retryFee}
            >
              The deposit can't be checked against your balance until it loads.
            </Notice>
          ) : null}
        </ActionForm>
      </div>

      {picker.open ? (
        <ShieldAssetPicker
          value={eth.pickerValue}
          onChange={(next) => {
            clearFinished();
            eth.onPickerChange(next);
            picker.close();
          }}
          onClose={picker.close}
        />
      ) : null}

      {setup.applicable && selected && setup.open ? (
        <SetupFlow
          assets={setup.assets}
          willApproveErc20={setup.willApproveErc20}
          onSuccess={setup.complete}
          onCancel={setup.dismiss}
        />
      ) : null}
    </>
  );
}
