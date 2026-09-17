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

/// Inputs to `useFeePanel`.
export interface FeePanelInputs {
  kind: FeeKind;
  selected: RegisteredAsset | undefined;
  /// The typed amount, in circuit units.
  amount: bigint | undefined;
  /// Display figure (`shownFee`), not the submit-gating `settledFee`.
  protocol: FeeBreakdown | undefined;
  /// A protocol-fee read is in flight, so the row opens before it lands.
  protocolPending?: boolean;
  /// Asset chosen to pay the relayer; defaults to the asset being moved.
  feeAsset?: bigint | undefined;
  /// Offers the picker; absent where the fee asset is locked.
  onFeeAsset?: ((asset: bigint) => void) | undefined;
  /// Deposit only: what its relayer fee is funded from.
  deposit?: DepositFeeSource | undefined;
  /// Display name for the moved asset (ETH over WETH), applied consistently to every row and option.
  spendSymbol?: string | undefined;
}

/// Where a deposit's relayer fee comes from: `msg.value` for native ETH, else the public wallet.
export type DepositFeeSource =
  | { asEth: true }
  | { asEth: false; principal: TokenAmount | undefined };

const NO_IDS: readonly bigint[] = [];

/// Everything `FeeSummary` and a form's submit gate need about fees.
export interface FeePanel {
  model: FeeSummaryModel | undefined;
  /// A figure on screen is being re-priced.
  refreshing: boolean;
  /// Relayer charge in circuit units of the paying asset (not base units like `model`); `0n` if none.
  relayerAmount: bigint;
  feeAsset: FeeAssetChoice | undefined;
  /// Why the relayer cannot be paid. A spend must not reach the prover while this is set.
  block: FeeBlock | undefined;
  /// The relayer's charge is not known yet; a submit gates on it.
  pending: boolean;
}

/// `asset` renamed to `spendSymbol` when one is given.
export function withSymbol<A extends { symbol: string }>(
  asset: A | undefined,
  spendSymbol: string | undefined,
): A | undefined {
  return asset && spendSymbol !== undefined ? { ...asset, symbol: spendSymbol } : asset;
}

function shownSymbol(
  id: bigint,
  symbol: string,
  selectedId: bigint | undefined,
  spendSymbol: string | undefined,
): string {
  return spendSymbol !== undefined && id === selectedId ? spendSymbol : symbol;
}

/// Joins the protocol fee, relayer quote and funding into the fee panel for a form.
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

  const payingWith = feeAsset ?? selected?.id;
  const resolved = resolveFeeOption(feeOptionFor(quote.data, payingWith), registry);
  const relayer =
    resolved && spendSymbol !== undefined && payingWith === selectedId
      ? { ...resolved, asset: { ...resolved.asset, symbol: spendSymbol } }
      : resolved;

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

  const erc20Deposit = kind === "deposit" && deposit?.asEth === false ? deposit : undefined;
  const readBalances =
    erc20Deposit !== undefined &&
    selected !== undefined &&
    quote.data?.charged === true &&
    !quote.isPlaceholderData;
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
      (!funding || !selected || (!!paying && principalOverruns(paying, selected, funding))),
  );

  return {
    model,
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

/// Withholds a shortfall on an empty amount, or one that says nothing true about a deposit.
function reportedBlock(
  found: FeeBlock | undefined,
  amount: bigint | undefined,
  shortfallWithheld: boolean,
): FeeBlock | undefined {
  if (found?.kind !== "shortfall") return found;
  return amount && amount > 0n && !shortfallWithheld ? found : undefined;
}

function shieldedFunding(option: FeeOption): FeeAssetFunding {
  return option.balance === undefined || option.affordable === undefined
    ? { balance: undefined, affordable: true }
    : { balance: option.balance, affordable: option.affordable };
}
