// Shield: move an asset from the public wallet into the pool.
//
// One card — the amount twice (figure and words), the asset pill that opens
// "Choose an asset", the balance it draws on, a collapsed Details row stating
// the fees in dollars and offering the token that pays the relayer, and
// "Shield 1.5 ETH" — with the one-time setup card and the page's closing line
// under it. No review step: a review guards sends that cannot be reversed to a
// stranger, and a shield lands in the user's own balance.

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

/// The capability gate, in front of everything the form needs.
///
/// Split in two rather than an early return inside one component: the hooks
/// below reach `wallet.chain.payerAddress()` transitively — `useDeposit`,
/// `useDepositSetup`, `useEthAssetField` — and hooks cannot be skipped. The
/// same shape as `flows/claim/components/ConnectGate.tsx`.
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

/// Shield's title and boundary.
const HEADER = (
  <ScreenHeader
    title="Shield"
    subtitle={<BoundaryLine from="Public wallet" to="Shielded pool" shielded="to" />}
  />
);

/// Native coin's decimals, for the balance a native-ETH deposit draws on.
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

  // The whole amount-and-fee view, not the figure being sent.
  const amount = useDepositAmount(selected, { asEth: eth.asEth, input: amountText });
  const setup = useDepositSetup({ asEth: eth.asEth, pulls: amount.pulls });
  const fees = useFeePanel({
    kind: "deposit",
    selected,
    amount: amount.parsed,
    // The displayed figure rather than the one gating the submit: the panel
    // keeps the last amount's fee on screen while the next is priced.
    protocol: amount.feeShown,
    protocolPending: amount.feePending,
    // The picker, as on the spends. Withheld on native ETH, whose relayer is
    // paid in the wrapped coin out of the same payment.
    feeAsset: amount.feeAsset,
    onFeeAsset: eth.asEth ? undefined : amount.onFeeAsset,
    deposit: eth.asEth ? { asEth: true } : { asEth: false, principal: amount.principalTotal },
    // Native ETH is wrapped on the way in; the rows name what leaves the wallet.
    spendSymbol,
  });

  // "Choose an asset" takes the form's place, and hands focus back to the
  // pill it was opened from.
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
      // Already `undefined` on the native path, where no other asset applies.
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
          // A failed allowance probe is reported by `SetupNotice`, which states
          // the reason and offers a remedy. Routing it here would run it through
          // `userMessage`, whose keyword match turns a failed `allowance`
          // read into "approval missing" and hides the underlying fault.
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
          // While the op runs the cards below the form describe a different moment.
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
                // Not a listbox: "Choose an asset" takes the form's place rather than
                // popping over it.
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
          {/* Without this the form cannot proceed: an unreadable protocol fee
              leaves the amount unvalidatable and nothing retries it. The
              relayer's half is `FeeDetails`'s to raise. See `feeFailed`. */}
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
          // What the run will do, not what gates the deposit — see `SetupNeeds`.
          willApproveErc20={setup.willApproveErc20}
          onSuccess={setup.complete}
          onCancel={setup.dismiss}
        />
      ) : null}
    </>
  );
}
