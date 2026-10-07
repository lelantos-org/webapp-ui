import { useState } from "react";
import type { ChainEntry, RegisteredAsset } from "@/config/chains";
import {
  type AssetSelectOption,
  useAssetSelectOptions,
  useBalances,
  useRegisteredAssets,
} from "@/features/assets";
import { useFeeQuote } from "@/features/fees";
import { useNameFee } from "@/features/names";
import { type FeeReading, feeReading, registrarFeeLabel, relayerFeeLabel } from "./fees";
import { fundingOf, fundingProblem } from "./funding";

export interface RegistrationFunding {
  /// Why nothing on this network can pay for a registration; `undefined` when something can, and
  /// while the registrar's fee is read.
  unavailable: string | undefined;
  /// The asset the registration is paid from, once known.
  asset: RegisteredAsset | undefined;
  /// Why the wallet cannot pay for the registration; `undefined` when it can.
  problem: string | undefined;
  registrarFee: FeeReading;
  relayerFee: FeeReading;
  retryRegistrarFee(): void;
  /// Set where registration is free: the asset is then the user's to pick, by its id as text.
  choice: { options: readonly AssetSelectOption[]; value: string } | undefined;
  choose(value: string): void;
  balancesLoading: boolean;
}

/// What a registration on `chain` costs, and the shielded asset that pays for it.
export function useRegistrationFunding(chain: ChainEntry): RegistrationFunding {
  const fee = useNameFee(chain);
  const relayerQuote = useFeeQuote("registerName");
  const assets = useRegisteredAssets();
  const balances = useBalances();
  const options = useAssetSelectOptions({ rateTag: false });
  /// The asset picked to pay from, where registration is free and no fee token decides it.
  const [chosen, setChosen] = useState<bigint | undefined>(undefined);

  const rows = balances.data?.balances;
  const held = (id: bigint) => rows?.find((b) => b.asset === id)?.balance ?? 0n;
  const funding = fee.data ? fundingOf(fee.data, assets, held, chosen) : undefined;
  const asset = funding && funding.kind !== "unavailable" ? funding.asset : undefined;
  const balance = rows && asset ? held(asset.id) : undefined;

  return {
    unavailable: funding?.kind === "unavailable" ? funding.reason : undefined,
    asset,
    problem: fee.data && funding ? fundingProblem(fee.data, funding, balance) : undefined,
    registrarFee: feeReading(fee.data && registrarFeeLabel(fee.data, asset), fee.isError),
    relayerFee: feeReading(relayerFeeLabel(relayerQuote.data, asset), relayerQuote.isError),
    retryRegistrarFee: () => void fee.refetch(),
    choice:
      funding?.kind === "choice"
        ? {
            options: options.filter((o) => funding.options.some((a) => String(a.id) === o.value)),
            value: asset ? String(asset.id) : "",
          }
        : undefined,
    choose: (value) => setChosen(BigInt(value)),
    balancesLoading: balances.isLoading,
  };
}
