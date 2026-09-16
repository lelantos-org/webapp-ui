// Everything `FeeSummary` needs, assembled from the two independent fee reads.
//
// The protocol fee is a function of the amount — a percentage of the transparent
// leg — and so is debounced against the amount field, while the relayer's is a
// function of gas and is keyed on the chain and kind alone. Joining them here
// keeps that difference in one place rather than in three forms.
//
// It also joins what is known early. The registry and the asset's protocol rate
// are amount-independent, and cached by the time a form mounts, so the panel can
// state which rows are coming, and in which token, before either fee query
// answers. See the note on arrival times in `fee-summary.ts`.
//
// An ERC-20 deposit's relayer fee is funded from the public wallet rather than
// from shielded notes, so its options are judged against public token balances
// instead of the quote's own `balance` and `affordable`; see `deposit-funding.ts`.

import type { FeeOption, TokenAmount } from "@lelantos-org/sdk";
import { depositFeeAssetRefusal } from "@lelantos-org/sdk/protocol";
import { useMemo } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { usePublicBalances, useRegisteredAssets } from "@/features/assets";
import type { FeeBreakdown } from "@/shared/domain/fee-math";
import type { FeeKind } from "@/shared/domain/op-kind";
import {
  type DepositFunding,
  depositFeeFunding,
  principalOverruns,
} from "../model/deposit-funding";
import type { FeeAssetChoice, FeeAssetFunding, FeeAssetOption } from "../model/fee-block";
import { type FeeBlock, feeBlockFor } from "../model/fee-block";
import { type FeeSummaryModel, feeLegFor, feeSummary } from "../model/fee-summary";
import { useAssetFeeBps } from "../quote/use-fee-preview";
import { feeOptionFor, resolveFeeOption, useFeeQuote } from "../quote/use-fee-quote";

export interface FeePanelInputs {
  kind: FeeKind;
  /// The asset being moved.
  selected: RegisteredAsset | undefined;
  /// The typed amount, in circuit units.
  amount: bigint | undefined;
  /// Protocol fee. Pass the figure to display (`shownFee`), not the one gating a
  /// submit (`settledFee`): this panel is display-only, and blanking it on every
  /// keystroke causes the flicker the panel avoids.
  protocol: FeeBreakdown | undefined;
  /// A protocol-fee read is in flight and will fill `protocol` in, so the row
  /// opens now rather than when the answer lands. See `feeIncoming`; a kind that
  /// states no protocol fee leaves this false.
  protocolPending?: boolean;
  /// Asset currently chosen to pay the relayer. Falls back to the asset being
  /// moved, which is the SDK's own default.
  feeAsset?: bigint | undefined;
  /// Offers the picker. Absent where the choice is locked — a native-ETH deposit
  /// or withdraw pays the relayer in the wrapped coin.
  onFeeAsset?: ((asset: bigint) => void) | undefined;
  /// Deposit only: what its relayer fee is funded from. See `DepositFeeSource`.
  deposit?: DepositFeeSource | undefined;
  /// The name to show for the asset being moved, where it is not the registry's.
  /// A native-ETH shield or unshield moves WETH notes but the user chose, and
  /// the pill shows, ETH; a panel saying "paid in WETH" under an "ETH" pill reads
  /// as a second asset. Applied to every row, option and block naming that
  /// asset, and to both sides of the cross-asset test, so relabelling cannot
  /// make a same-asset fee look cross-asset.
  spendSymbol?: string | undefined;
}

/// Where a deposit's relayer fee comes from.
///
/// Native ETH pays it in the wrapped coin out of `msg.value`, checked with the
/// amount against the native balance, so no token balance says anything about
/// it. An ERC-20 deposit pulls it from the public wallet — from the same balance
/// as `principal`, the amount plus its protocol fee in base units of the token
/// being shielded (`DepositAmount.principalTotal`), where the two share a token.
export type DepositFeeSource =
  | { asEth: true }
  | { asEth: false; principal: TokenAmount | undefined };

/// No balances to read; one array, so the query list keeps its identity.
const NO_IDS: readonly bigint[] = [];

export interface FeePanel {
  model: FeeSummaryModel | undefined;
  /// A figure already on screen is being re-priced. Distinct from a row with no
  /// figure, which the model reports per row; this state must not move the
  /// layout, since there is something to read while it resolves.
  refreshing: boolean;
  /// The relayer's charge in circuit units of the paying asset, or `0n` when
  /// nothing is charged or the quote has not landed.
  ///
  /// Circuit units, unlike `model`, whose rows are base units for display. This
  /// feeds `useSpendableMax`, which works in the same units as the selector.
  relayerAmount: bigint;
  /// Absent where the asset is not the user's to choose: a native-ETH deposit or
  /// withdraw has no `feeAsset` option.
  feeAsset: FeeAssetChoice | undefined;
  /// Anything that stops the relayer being paid: a shortfall, a failed quote, or
  /// a charge with no option for the paying asset. A spend must not reach the
  /// prover while this is set — the default fee asset is whatever is being sent
  /// and the picker never checked it, so without this a short user would pay a
  /// full prepare-and-prove cycle to learn the fee asset fell short. Absent while
  /// the quote is in flight: unknown is not the same as short. See `fee-block.ts`; `feeBlockReason` phrases it.
  block: FeeBlock | undefined;
  /// The relayer's charge is not known yet: the quote is loading, or the figure
  /// held on screen belongs to the previous query key (another chain). Never set
  /// alongside a failed quote, which is `block` instead. A submit gates on it as
  /// "Working out the fee…".
  pending: boolean;
}

/// `asset` under the name the form gives it, where that is not the registry's.
/// See `FeePanelInputs.spendSymbol`.
export function withSymbol<A extends { symbol: string }>(
  asset: A | undefined,
  spendSymbol: string | undefined,
): A | undefined {
  return asset && spendSymbol !== undefined ? { ...asset, symbol: spendSymbol } : asset;
}

/// `symbol`, unless `id` is the asset being moved and the form names it
/// otherwise. See `FeePanelInputs.spendSymbol`.
function shownSymbol(
  id: bigint,
  symbol: string,
  selectedId: bigint | undefined,
  spendSymbol: string | undefined,
): string {
  return spendSymbol !== undefined && id === selectedId ? spendSymbol : symbol;
}

export function useFeePanel({
  kind,
  selected,
  amount,
  protocol,
  protocolPending = false,
  feeAsset,
  onFeeAsset,
  deposit,
  spendSymbol,
}: FeePanelInputs): FeePanel {
  const registry = useRegisteredAssets();
  const selectedId = selected?.id;
  const spendAsset = useMemo(() => withSymbol(selected, spendSymbol), [selected, spendSymbol]);
  const quote = useFeeQuote(kind);
  const feeBps = useAssetFeeBps(selected?.id, feeLegFor(kind));

  // The paying asset: the chosen one, or, as in the SDK, the asset being moved.
  const payingWith = feeAsset ?? selected?.id;
  const resolved = resolveFeeOption(feeOptionFor(quote.data, payingWith), registry);
  const relayer =
    resolved && spendSymbol !== undefined && payingWith === selectedId
      ? { ...resolved, asset: { ...resolved.asset, symbol: spendSymbol } }
      : resolved;

  // The relayer row's token comes from the picker rather than the quote, and so
  // is known first. Withheld only once the quote confirms this chain is
  // subsidised; assuming so while the quote is in flight would draw the row a
  // moment later.
  const paying = registry.find((a) => a.id === payingWith);
  const subsidised = quote.data?.charged === false;
  const paySymbol = paying && shownSymbol(paying.id, paying.symbol, selectedId, spendSymbol);
  const payDecimals = paying?.decimals;
  const payToken = paying?.token;
  const relayerAsset = useMemo(
    () =>
      subsidised || paySymbol === undefined || payDecimals === undefined
        ? undefined
        : { symbol: paySymbol, decimals: payDecimals, token: payToken },
    [subsidised, paySymbol, payDecimals, payToken],
  );

  const model = useMemo(
    () =>
      feeSummary({
        kind,
        amount,
        spendAsset,
        protocol,
        protocolPending,
        relayer,
        feeBps,
        relayerAsset,
      }),
    [kind, amount, spendAsset, protocol, protocolPending, relayer, feeBps, relayerAsset],
  );

  // Only assets the registry resolves. One the relayer quotes but the registry
  // does not know cannot be selected, since the note paying in it cannot be
  // built. Nor, on a deposit, one the pool would refuse to take its fee in.
  const payable = useMemo(
    () =>
      (quote.data?.options ?? []).flatMap((o) => {
        const entry = registry.find((a) => a.id === o.asset.id);
        if (!entry) return [];
        if (
          kind === "deposit" &&
          selected &&
          depositFeeAssetRefusal(selected, entry, deposit?.asEth ?? false) !== undefined
        ) {
          return [];
        }
        return [{ entry, quoted: o }];
      }),
    [quote.data, registry, kind, selected, deposit?.asEth],
  );

  // An ERC-20 deposit's fee is funded from the public wallet, so its options are
  // judged against public balances — read only while there is a charge to judge,
  // and never for a placeholder quote's assets, which belong to another chain.
  const erc20Deposit = kind === "deposit" && deposit?.asEth === false ? deposit : undefined;
  const readBalances =
    erc20Deposit !== undefined &&
    selected !== undefined &&
    quote.data?.charged === true &&
    !quote.isPlaceholderData;
  // The deposited token first, so a fee option over it shares the form's own read.
  const balances = usePublicBalances(
    readBalances ? [selected.id, ...payable.map((p) => p.entry.id)] : NO_IDS,
  );
  const funding: DepositFunding | undefined = erc20Deposit && {
    principal: erc20Deposit.principal,
    balances,
  };

  const options = payable.map(({ entry, quoted }): FeeAssetOption => {
    const price = {
      id: entry.id,
      symbol: shownSymbol(entry.id, entry.symbol, selectedId, spendSymbol),
      decimals: entry.decimals,
      scale: entry.scale,
      index: entry.index,
      amount: quoted.amount,
    };
    return funding && selected
      ? { ...price, ...depositFeeFunding({ ...entry, amount: quoted.amount }, selected, funding) }
      : { ...price, ...shieldedFunding(quoted) };
  });

  // Read off the same options the picker shows, so the two can never disagree
  // about what is affordable. Nothing is blocked without an asset to move.
  const found = feeBlockFor({
    payingWith: selected ? payingWith : undefined,
    payingSymbol: paySymbol,
    charged: quote.data?.charged,
    options,
    error: quote.isError ? quote.error : undefined,
    retry: () => void quote.refetch(),
  });
  const block = reportedBlock(
    found,
    amount,
    kind === "deposit" &&
      // Without public funding the options' verdicts are the quote's, about
      // shielded notes the deposit never touches.
      (!funding || !selected || (!!paying && principalOverruns(paying, selected, funding))),
  );

  return {
    model,
    // `isFetching` rather than `isPending`: the quote is kept across refetches
    // (`keepPreviousData`), so the state to report is that the figure on screen
    // is being replaced, not that there is none.
    refreshing: quote.isFetching,
    relayerAmount: relayer?.amount ?? 0n,
    feeAsset:
      onFeeAsset && quote.data?.charged
        ? { options, value: payingWith, onChange: onFeeAsset }
        : undefined,
    block,
    pending: !!selected && !quote.isError && (quote.data === undefined || quote.isPlaceholderData),
  };
}

/// The fee block the panel reports, out of the one the quote implies.
///
/// A shortfall is only news once there is something to pay for. On an empty
/// field it is true of every empty wallet, and reporting it there opened the
/// Details row in warn beside "Enter an amount to see what it costs" — two
/// statements about a fee for a send nobody had asked for. Submit is already
/// refused by the amount, so withholding it costs no protection. A failed
/// quote is still reported: it is about the relayer, not the amount.
///
/// `shortfallWithheld` drops a shortfall that says nothing true about a
/// deposit: one its amount already explains, the principal alone overrunning the
/// token paying the fee, and a native-ETH deposit's, whose options were judged
/// against shielded notes it never touches.
function reportedBlock(
  found: FeeBlock | undefined,
  amount: bigint | undefined,
  shortfallWithheld: boolean,
): FeeBlock | undefined {
  if (found?.kind !== "shortfall") return found;
  return amount && amount > 0n && !shortfallWithheld ? found : undefined;
}

/// A spend option's funding, as the quote states it from this wallet's notes.
///
/// A deposit quote states none — its fee is funded from the public wallet — so an
/// option without figures reads as unknown, which is selectable rather than short.
function shieldedFunding(option: FeeOption): FeeAssetFunding {
  return option.balance === undefined || option.affordable === undefined
    ? { balance: undefined, affordable: true }
    : { balance: option.balance, affordable: option.affordable };
}
