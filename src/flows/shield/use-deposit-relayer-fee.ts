import { type TokenAmount, toBaseUnits } from "@lelantos-org/sdk";
import { depositFeeAssetRefusal } from "@lelantos-org/sdk/protocol";
import { useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useRegisteredAssets } from "@/features/assets";
import { feeOptionFor, resolveFeeOption, useFeeQuote } from "@/features/fees";
import { ZERO_BASE } from "@/shared/domain/units";

export interface DepositRelayerFee {
  /// The chosen fee asset, or `undefined` for the deposited asset.
  feeAsset: bigint | undefined;
  onFeeAsset(asset: bigint): void;
  /// The asset paying: the one chosen, or the deposited one.
  paying: RegisteredAsset | undefined;
  /// The charge in base units of `paying`; `undefined` unless known, `0n` only when subsidised.
  amount: TokenAmount | undefined;
  /// Why the charge cannot be known. Never read as `0n`: that would under-size the Permit2 window.
  problem: "quote-failed" | "not-accepted" | undefined;
  retry(): void;
}

/// Which asset pays a deposit's relayer, and what it charges in that asset.
export function useDepositRelayerFee(
  selected: RegisteredAsset | undefined,
  asEth: boolean,
): DepositRelayerFee {
  const registry = useRegisteredAssets();

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
      // Placeholder data is another chain's or account's quote: never price with it.
      quote.data === undefined || quote.isPlaceholderData || problem
        ? undefined
        : quote.data.charged && relayer
          ? // Through the yield index: `amount * scale` would under-reserve a yield asset's fee.
            toBaseUnits(relayer.amount, relayer.asset)
          : ZERO_BASE,
    problem,
    retry: () => void quote.refetch(),
  };
}

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
