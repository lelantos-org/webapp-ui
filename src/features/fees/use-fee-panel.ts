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

import { useMemo } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useRegisteredAssets } from "@/features/assets";
import type { FeeBreakdown } from "@/shared/domain/fee-math";
import type { FeeKind } from "@/shared/domain/op-kind";
import type { FeeAssetChoice, FeeAssetOption } from "./fee-block";
import { type FeeBlock, feeBlockFor } from "./fee-block";
import { type FeeSummaryModel, feeLegFor, feeSummary } from "./fee-summary";
import { useAssetFeeBps } from "./use-fee-preview";
import { feeOptionFor, resolveFeeOption, useFeeQuote } from "./use-fee-quote";

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
  onFeeAsset?: ((asset: bigint) => void) | undefined;
  /// The name to show for the asset being moved, where it is not the registry's.
  /// A native-ETH shield or unshield moves WETH notes but the user chose, and
  /// the pill shows, ETH; a panel saying "paid in WETH" under an "ETH" pill reads
  /// as a second asset. Applied to every row, option and block naming that
  /// asset, and to both sides of the cross-asset test, so relabelling cannot
  /// make a same-asset fee look cross-asset.
  spendSymbol?: string | undefined;
}

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
  /// Absent where the asset is not the user's to choose: a deposit mints its
  /// relayer note in the deposited asset, and a native-ETH withdraw has no
  /// `feeAsset` option.
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
  spendSymbol,
}: FeePanelInputs): FeePanel {
  const registry = useRegisteredAssets();
  const selectedId = selected?.id;
  const spendAsset = useMemo(
    () => (selected && spendSymbol !== undefined ? { ...selected, symbol: spendSymbol } : selected),
    [selected, spendSymbol],
  );
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
  // built.
  const options = useMemo<FeeAssetOption[]>(
    () =>
      (quote.data?.options ?? []).flatMap((o) => {
        const entry = registry.find((a) => a.id === o.asset.id);
        if (!entry) return [];
        return [
          {
            id: entry.id,
            symbol: shownSymbol(entry.id, entry.symbol, selectedId, spendSymbol),
            decimals: entry.decimals,
            scale: entry.scale,
            index: entry.index,
            amount: o.amount,
            balance: o.balance,
            affordable: o.affordable,
          },
        ];
      }),
    [quote.data, registry, selectedId, spendSymbol],
  );

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
  const block = reportedBlock(found, kind, amount);

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
/// A deposit never reports one. Its relayer note is minted in the deposited
/// asset and funded from the public wallet (`resolveDepositFee`), so there is no
/// fee asset to choose and no shielded balance to fall short in; the quote's
/// `affordable` compares against shielded notes, which say nothing about the
/// deposit, and a first shield would read as a shortfall. Only the blocks about
/// the quote itself apply.
function reportedBlock(
  found: FeeBlock | undefined,
  kind: FeeKind,
  amount: bigint | undefined,
): FeeBlock | undefined {
  if (found?.kind !== "shortfall") return found;
  return kind === "deposit" || !(amount && amount > 0n) ? undefined : found;
}
