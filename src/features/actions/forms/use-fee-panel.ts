// Everything `FeeSummary` needs, assembled from the two independent fee reads.
//
// The protocol fee is a function of the amount — a percentage of the transparent
// leg — and so is debounced against the amount field, while the relayer's is a
// function of gas and is keyed on the chain and kind alone. Joining them here
// keeps that difference in one place rather than in three forms.
//
// It also joins what is known early. `feeBps` and the registry are chain-wide
// and cached by the time a form mounts, so the panel can state which rows are
// coming, and in which token, before either fee query answers. See the note on
// arrival times in `fee-summary.ts`.

import { useMemo } from "react";
import type { RegisteredAsset } from "@/features/assets";
import { useRegisteredAssets } from "@/features/assets";
import type { FeeBreakdown } from "@/shared/lib/fees";
import { useFeeBps } from "../use-fee-preview";
import { feeOptionFor, resolveFeeOption, useFeeQuote } from "../use-fee-quote";
import { type FeeKind, type FeeSummaryModel, feeSummary } from "./fee-summary";

/// One asset the relayer will take, joined to the registry entry that lets the
/// picker render it.
///
/// Amounts are circuit units, as the SDK quotes them; the picker scales them for
/// display with `scale`.
export interface FeeAssetOption {
  id: bigint;
  symbol: string;
  decimals: number;
  scale: bigint;
  /// What the relay costs when paid in this asset.
  amount: bigint;
  /// This wallet's unspent balance in it.
  balance: bigint;
  /// Whether `balance` covers `amount`. Necessary but not sufficient: the notes
  /// must also fit the circuit's input slots, which only coin selection can
  /// decide. See `FeeOption.affordable`.
  affordable: boolean;
}

export interface FeeAssetChoice {
  /// What the relayer will take, with this wallet's balance in each.
  options: FeeAssetOption[];
  /// Currently selected fee asset id.
  value: bigint | undefined;
  onChange(asset: bigint): void;
}

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
}

export function useFeePanel({
  kind,
  selected,
  amount,
  protocol,
  protocolPending = false,
  feeAsset,
  onFeeAsset,
}: FeePanelInputs): FeePanel {
  const registry = useRegisteredAssets();
  const quote = useFeeQuote(kind);
  const feeBps = useFeeBps();

  // The paying asset: the chosen one, or, as in the SDK, the asset being moved.
  const payingWith = feeAsset ?? selected?.id;
  const relayer = resolveFeeOption(feeOptionFor(quote.data, payingWith), registry);

  // The relayer row's token comes from the picker rather than the quote, and so
  // is known first. Withheld only once the quote confirms this chain is
  // subsidised; assuming so while the quote is in flight would draw the row a
  // moment later.
  const paying = registry.find((a) => a.id === payingWith);
  const subsidised = quote.data?.charged === false;
  const paySymbol = paying?.symbol;
  const payDecimals = paying?.decimals;
  const relayerAsset = useMemo(
    () =>
      subsidised || paySymbol === undefined || payDecimals === undefined
        ? undefined
        : { symbol: paySymbol, decimals: payDecimals },
    [subsidised, paySymbol, payDecimals],
  );

  const model = useMemo(
    () =>
      feeSummary({
        kind,
        amount,
        spendAsset: selected,
        protocol,
        protocolPending,
        relayer,
        feeBps,
        relayerAsset,
      }),
    [kind, amount, selected, protocol, protocolPending, relayer, feeBps, relayerAsset],
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
            symbol: entry.symbol,
            decimals: entry.decimals,
            scale: entry.scale,
            amount: o.amount,
            balance: o.balance,
            affordable: o.affordable,
          },
        ];
      }),
    [quote.data, registry],
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
  };
}
