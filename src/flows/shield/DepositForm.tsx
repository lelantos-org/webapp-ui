// Shield: move an asset from the public wallet into the pool.
//
// One card — the amount twice (figure and words), the asset pill that opens
// "Choose an asset", the balance it draws on, a collapsed Details row stating
// the fees in dollars, and "Shield 1.5 ETH" — with the one-time setup card and
// the page's closing line under it. No review step: a review guards sends that
// cannot be reversed to a stranger, and a shield lands in the user's own
// balance.

import { supportsAllowanceTransfer } from "@lelantos-org/sdk";
import { type ReactNode, useCallback, useMemo } from "react";
import { z } from "zod";
import type { RegisteredAsset } from "@/config/chains";
import {
  DEFAULT_ASSET_ID,
  nativeEthView,
  priceOf,
  ShieldAssetPicker,
  useEthAssetField,
  usePrices,
  useRegisteredAssets,
} from "@/features/assets";
import { FeeDetails, type FeePanel, feeTotalUsd, useFeePanel } from "@/features/fees";
import {
  ActionForm,
  AmountHero,
  type AmountValidation,
  AssetPill,
  amountField,
  asEthField,
  BoundaryLine,
  defaultAssetField,
  SpendFeeSummary,
  useActionForm,
  useActionSubmit,
} from "@/features/op-form";
import { useWallet, useWalletInstance } from "@/features/wallet";
import type { AssetUnits } from "@/shared/domain/units";
import { formatAmountForDisplay } from "@/shared/lib/format/asset";
import { formatUsd } from "@/shared/lib/format/money";
import { formatFixed } from "@/shared/lib/format/number";
import { Notice } from "@/shared/ui/Notice";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { useReplacingScreen } from "@/shared/ui/use-replacing-screen";
import { DepositUnavailable } from "./components/DepositUnavailable";
import { depositSubmitBlock } from "./deposit-block";
import { SetupAllNotice } from "./setup/SetupAllNotice";
import { SetupFlow } from "./setup/SetupFlow";
import "./shield.css";
import { SetupNotice } from "./setup/SetupNotice";
import { type DepositSetup, useDepositSetup } from "./setup/use-deposit-setup";
import { useDeposit } from "./use-deposit";
import { useDepositAmount } from "./use-deposit-amount";

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
  const setup = useDepositSetup(selected, { asEth: eth.asEth, total: amount.total });
  const fees = useFeePanel({
    kind: "deposit",
    selected,
    amount: amount.parsed,
    // The displayed figure rather than the one gating the submit: the panel
    // keeps the last amount's fee on screen while the next is priced.
    protocol: amount.feeShown,
    protocolPending: amount.feePending,
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
    },
    feeBlocked: !!fees.block,
  });

  const onSubmit = useActionSubmit<DepositInput>(form, (values, ctx) =>
    m.mutateAsync({ amount: ctx.amount, asset: ctx.asset.id, asEth: values.asEth }),
  );

  // What the run will do, not what gates the deposit — see `SetupNeeds`.
  const setupErc20 = setup.needs.willApproveErc20;
  const willApproveErc20 = useCallback(() => setupErc20, [setupErc20]);
  const setupAssets = useMemo(() => (selected ? [selected] : []), [selected]);

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
          assets={setupAssets}
          willApproveErc20={willApproveErc20}
          onSuccess={setup.complete}
          onCancel={setup.dismiss}
        />
      ) : null}
    </>
  );
}

interface DepositAfterProps {
  selected: RegisteredAsset | undefined;
  /// The symbol the screen shows: "ETH" on the native path.
  symbol: string | undefined;
  asEth: boolean;
  setup: DepositSetup;
}

/// Under Shield's card: the one-time setup the chosen asset still needs — or the
/// offer to set up the rest — and the page's closing line.
function DepositAfter({ selected, symbol, asEth, setup }: DepositAfterProps) {
  const selectedNeedsSetup = setup.applicable && (setup.needs.needsSetup || setup.unknown);
  return (
    <>
      {selectedNeedsSetup && selected ? (
        <SetupNotice
          asset={selected}
          willApproveErc20={setup.needs.willApproveErc20}
          unknown={setup.unknown}
          onRun={setup.show}
        />
      ) : (
        <SetupAllNotice
          current={
            symbol && (!setup.applicable || (!setup.blocked && !setup.needs.needsSetup))
              ? { symbol, native: asEth }
              : undefined
          }
        />
      )}
      <p className="footnote screen-note">
        Once shielded, your balance and every transfer are private.
      </p>
    </>
  );
}

/// The closed Details row: the fees in dollars.
///
/// Falls back to the token line whenever a dollar figure would be a guess — a
/// fee still being priced, or an asset with no price. In both lengths, like
/// Send's: `FeeDetails`' own line is the long one only, and on a phone it
/// would wrap the Details row onto two lines.
function DepositFeeSummary({ fees }: { fees: FeePanel }) {
  const prices = usePrices();
  const hasFees = !!fees.model?.rows.some((r) => r.key !== "amount");
  const usd = hasFees ? feeTotalUsd(fees.model, (t) => priceOf(prices, t)) : undefined;
  if (usd === undefined) return <SpendFeeSummary model={fees.model} />;
  const text = formatUsd(usd);
  // `<$0.01` already says it is approximate.
  const figure = text.startsWith("<") ? text : `≈ ${text}`;
  return (
    <>
      <span className="only-wide">Total fees</span>
      <span className="only-narrow">Fees</span> {figure}
    </>
  );
}

// Shield's lines that depend on the path the deposit takes.

/// The line under the CTA: what the shield will ask of the wallet.
///
/// Per path, because the three differ in what the wallet shows. Native coin is
/// one payable transaction (the contract wraps it). An AllowanceTransfer chain
/// pulls within the window setup granted, so it is one transaction too. The
/// witness path signs a Permit2 message first.
///
/// A value rather than a component: `ActionForm` reserves the footnote's row
/// only for a defined one.
function depositFootnote(
  asEth: boolean,
  symbol: string | undefined,
  allowanceTransfer: boolean,
): ReactNode {
  if (!symbol) return undefined;
  if (asEth) {
    return (
      <>
        ETH is wrapped to WETH, then shielded.
        <span className="only-wide"> One transaction from your wallet.</span>
      </>
    );
  }
  return allowanceTransfer
    ? `${symbol} moves from your wallet in one transaction.`
    : `You sign a permit for ${symbol}, then your wallet sends one transaction.`;
}

/// Why there is no Max on native ETH, said where the button would be.
///
/// A native deposit pays its gas from the same balance it draws on, and nothing
/// here can estimate that gas, so any "max" would be a figure the wallet then
/// refuses. Only said when there is a balance to be maxed.
function nativeMaxHint(asEth: boolean, balance: bigint | undefined): string | undefined {
  return asEth && balance !== undefined && balance > 0n
    ? "No Max for ETH: the network fee comes out of the same balance and can't be known in advance."
    : undefined;
}

/// The amount as the CTA and the progress card name it: "1.5 ETH". Absent until
/// there is a positive amount of a named asset.
function shieldFigure(
  asset: AssetUnits | undefined,
  amount: bigint | undefined,
  symbol: string | undefined,
): string | undefined {
  return asset && amount !== undefined && amount > 0n && symbol
    ? `${formatAmountForDisplay(amount, asset)} ${symbol}`
    : undefined;
}

/// The public balance the deposit draws on, in base units, as `AmountHero`
/// shows it. A value rather than a component: the hero reserves the balance row
/// only for a defined one.
function walletBalance(
  value: bigint | undefined,
  decimals: number | undefined,
  symbol: string | undefined,
): ReactNode {
  if (value === undefined || decimals === undefined) return undefined;
  return (
    <>
      {formatFixed(value, decimals, 2, 4)}
      <span className="only-wide"> {symbol}</span>
    </>
  );
}

/// The field's own error for a deposit: its total, fees included, is more than
/// the wallet holds. Other amount problems are said under the button.
function depositAmountError(v: AmountValidation): string | undefined {
  return v.insufficient ? "More than your wallet holds once fees are added" : undefined;
}
