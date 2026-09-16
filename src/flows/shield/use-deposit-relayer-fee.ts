// The relayer's half of a deposit's cost: which asset pays it, and what it
// charges in that asset. Split from `use-deposit-amount`, which folds it into the
// figures the form validates.
//
// The fee asset is the user's to choose, as on the spends, within what the pool
// takes for a deposit (the SDK's `depositFeeAssetRefusal`). The charge is amount-independent, so
// it is known before anything is typed and can size the "max" button.

import { type TokenAmount, toBaseUnits } from "@lelantos-org/sdk";
import { depositFeeAssetRefusal } from "@lelantos-org/sdk/protocol";
import { useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useRegisteredAssets } from "@/features/assets";
import { feeOptionFor, resolveFeeOption, useFeeQuote } from "@/features/fees";
import { ZERO_BASE } from "@/shared/domain/units";

export interface DepositRelayerFee {
  /// The chosen fee asset as it applies to this deposit, or `undefined` for the
  /// deposited asset — the SDK's default — including on a locked path.
  feeAsset: bigint | undefined;
  /// Choose the asset paying the relayer.
  onFeeAsset(asset: bigint): void;
  /// The asset paying: the one chosen, or the deposited one. `undefined` only
  /// without a deposited asset.
  paying: RegisteredAsset | undefined;
  /// The charge in base units of `paying`. `undefined` while the quote is
  /// loading, when it failed, or when the relayer charges but quotes nothing for
  /// that asset; `0n` only on a chain that subsidises.
  amount: TokenAmount | undefined;
  /// Why the charge cannot be known, as opposed to not known yet.
  ///
  /// Neither may read as `0n`: a failed quote, or a quote with no option for the
  /// asset, would then size a Permit2 window short of what the pool pulls,
  /// passing every check in the form and failing at submit.
  problem: "quote-failed" | "not-accepted" | undefined;
  /// Re-run a failed quote.
  retry(): void;
}

export function useDepositRelayerFee(
  selected: RegisteredAsset | undefined,
  asEth: boolean,
): DepositRelayerFee {
  const registry = useRegisteredAssets();

  // Left unset until the user picks. `undefined` means the deposited asset,
  // which is the SDK's default and stays correct across asset changes.
  const [chosen, setChosen] = useState<bigint | undefined>(undefined);
  const chosenEntry = resolveChoice(chosen, selected, registry, asEth);
  const paying = chosenEntry ?? selected;

  const quote = useFeeQuote("deposit");
  const relayer = resolveFeeOption(feeOptionFor(quote.data, paying?.id), registry);
  const problem = quote.isError
    ? "quote-failed"
    : quote.data?.charged && selected && !relayer
      ? "not-accepted"
      : undefined;

  return {
    feeAsset: chosenEntry?.id,
    onFeeAsset: (asset) => setChosen(asset === selected?.id ? undefined : asset),
    paying,
    amount:
      // A placeholder is the previous chain's or account's quote, kept on screen
      // while this one loads; it prices nothing here.
      quote.data === undefined || quote.isPlaceholderData || problem
        ? undefined
        : quote.data.charged && relayer
          ? // Through the yield index, as the fee panel's rows are: a unit of a
            // yield asset is worth `scale * index / RAY`, so `amount * scale`
            // under-reserves the fee in both the total and the max.
            toBaseUnits(relayer.amount, relayer.asset)
          : ZERO_BASE,
    problem,
    retry: () => void quote.refetch(),
  };
}

/// The chosen fee asset's entry, where it applies to a deposit of `selected`;
/// otherwise `undefined`, for the deposited asset.
///
/// Derived rather than cleared on change, like a spend's locked fee asset: a
/// choice valid for one deposit asset can be refused for the next — native ETH
/// takes no other fee asset, and a yield asset pays only its own deposit — and
/// falls back to the SDK's default rather than being forgotten.
function resolveChoice(
  chosen: bigint | undefined,
  selected: RegisteredAsset | undefined,
  registry: readonly RegisteredAsset[],
  asEth: boolean,
): RegisteredAsset | undefined {
  if (chosen === undefined || !selected || chosen === selected.id) return undefined;
  const entry = registry.find((a) => a.id === chosen);
  return entry && depositFeeAssetRefusal(selected, entry, asEth) === undefined ? entry : undefined;
}
