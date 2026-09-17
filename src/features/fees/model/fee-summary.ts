import { toBaseUnits } from "@lelantos-org/sdk";
import type { FeeBreakdown } from "@/shared/domain/fee-math";
import type { FeeKind, FeeLeg } from "@/shared/domain/op-kind";
import { type AssetLabel, type AssetUnits, baseUnitsUsd } from "@/shared/domain/units";
import { formatBps } from "@/shared/lib/format/money";

/// Label and decimals a row renders with. No `token` leaves the row unpriced in USD.
export interface RowAsset extends AssetLabel, Pick<AssetUnits, "decimals"> {}

/// One summary line: a non-negative base-unit `amount` of `asset`, with direction in `sign`.
export interface FeeRow {
  key: string;
  label: string;
  /// `undefined` while the charge applies but is not yet priced; rendered as a placeholder.
  amount: bigint | undefined;
  asset: RowAsset;
  sign: "none" | "minus" | "plus";
  /// Formatted rate (`0.30%`), set on the protocol row only.
  rate?: string;
}

/// Rows, total and headline for a spend's fee panel.
export interface FeeSummaryModel {
  rows: FeeRow[];
  /// Sum of the fee rows; absent when they span assets.
  total: FeeRow | undefined;
  /// The bottom line; absent on a swap.
  headline: FeeRow | undefined;
  /// A cross-asset deposit's relayer fee, stated beside `headline` and never added into it.
  headlineExtra: FeeRow | undefined;
  /// The relayer is paid in an asset the spend is not moving.
  crossAsset: boolean;
}

/// Inputs to `feeSummary`: amount in circuit units, fees as they arrive.
export interface FeeSummaryInput {
  kind: FeeKind;
  amount: bigint | undefined;
  spendAsset: (AssetUnits & AssetLabel) | undefined;
  protocol: FeeBreakdown | undefined;
  /// Relayer charge in circuit units, resolved against the webapp registry (SDK decimals are optional).
  relayer: { amount: bigint; asset: AssetUnits & AssetLabel } | undefined;
  /// The asset's rate for this kind's leg; labels the protocol row before it is priced. `0n` hides it.
  feeBps?: bigint | undefined;
  /// A protocol-fee read is in flight, so hold the row open.
  protocolPending?: boolean;
  /// The picker's paying asset, so the relayer row holds its place before the quote lands.
  relayerAsset?: RowAsset | undefined;
}

const KIND: Record<FeeKind, { sign?: "plus" | "minus"; leg: FeeLeg; headline?: string }> = {
  deposit: { sign: "plus", leg: "deposit", headline: "You pay" },
  withdraw: { sign: "minus", leg: "withdraw", headline: "You receive" },
  transfer: { leg: "withdraw", headline: "Recipient gets" },
  swap: { sign: "minus", leg: "withdraw" },
};

/// Which of the asset's two rates a kind is charged at.
export function feeLegFor(kind: FeeKind): FeeLeg {
  return KIND[kind].leg;
}

function protocolRowFor(
  kind: FeeKind,
  spendAsset: RowAsset,
  protocol: FeeBreakdown | undefined,
  feeBps: bigint | undefined,
  pending: boolean,
): FeeRow | undefined {
  const { sign } = KIND[kind];
  if (!sign) return undefined;
  if (protocol && protocol.fee <= 0n) return undefined;

  const bps = protocol?.feeBps ?? feeBps;
  if (!protocol && (!pending || bps === undefined || bps === 0n)) return undefined;

  const rate = bps === undefined ? undefined : formatBps(bps, 2);
  return {
    key: "protocol",
    label: rate === undefined ? "Protocol fee" : `Protocol fee (${rate})`,
    amount: protocol?.fee,
    asset: spendAsset,
    sign,
    ...(rate === undefined ? {} : { rate }),
  };
}

function relayerRowFor(
  relayer: FeeSummaryInput["relayer"],
  relayerAsset: RowAsset | undefined,
): FeeRow | undefined {
  const asset = relayer
    ? {
        symbol: relayer.asset.symbol,
        decimals: relayer.asset.decimals,
        token: relayer.asset.token,
      }
    : relayerAsset;
  if (!asset) return undefined;
  if (relayer && relayer.amount <= 0n) return undefined;
  return {
    key: "relayer",
    label: "Relayer fee",
    amount: relayer ? toBaseUnits(relayer.amount, relayer.asset) : undefined,
    asset,
    sign: "plus",
  };
}

function headlineAmount(
  kind: FeeKind,
  base: bigint,
  protocolFee: bigint | undefined,
  relayerFee: bigint | undefined,
): bigint | undefined {
  if (protocolFee === undefined) return undefined;
  // Only a deposit's headline carries the relayer fee; elsewhere it comes out of shielded change.
  if (kind !== "deposit") return base - protocolFee;
  if (relayerFee === undefined) return undefined;
  return base + protocolFee + relayerFee;
}

/// The fee panel model for a spend, or `undefined` without a positive amount and asset.
export function feeSummary({
  kind,
  amount,
  spendAsset,
  protocol,
  relayer,
  feeBps,
  protocolPending = false,
  relayerAsset,
}: FeeSummaryInput): FeeSummaryModel | undefined {
  if (!spendAsset || amount === undefined || amount <= 0n) return undefined;

  // `spendAsset` must carry the yield index, or a withdraw subtracts today's fee from a stale amount.
  const base = toBaseUnits(amount, spendAsset);
  const rows: FeeRow[] = [
    { key: "amount", label: "Amount", amount: base, asset: spendAsset, sign: "none" },
  ];

  const protocolRow = protocolRowFor(kind, spendAsset, protocol, feeBps, protocolPending);
  if (protocolRow) rows.push(protocolRow);
  const relayerRow = relayerRowFor(relayer, relayerAsset);
  if (relayerRow) rows.push(relayerRow);

  const crossAsset = !!relayerRow && relayerRow.asset.symbol !== spendAsset.symbol;

  const feeRows = feeRowsOf({ rows });
  const total =
    feeRows.length > 1 && !crossAsset
      ? {
          key: "total",
          label: "Total fees",
          amount: feeRows.some((r) => r.amount === undefined)
            ? undefined
            : feeRows.reduce((a, r) => a + (r.amount ?? 0n), 0n),
          asset: spendAsset,
          sign: "none" as const,
        }
      : undefined;

  const { headline: label } = KIND[kind];
  const separatePull = kind === "deposit" && crossAsset;
  const headline = label
    ? {
        key: "headline",
        label,
        amount: headlineAmount(
          kind,
          base,
          protocolRow ? protocolRow.amount : 0n,
          relayerRow && !separatePull ? relayerRow.amount : 0n,
        ),
        asset: spendAsset,
        sign: "none" as const,
      }
    : undefined;
  const headlineExtra =
    separatePull && relayerRow
      ? { ...relayerRow, key: "headline-relayer", sign: "none" as const }
      : undefined;

  return { rows, total, headline, headlineExtra, crossAsset };
}

/// The fee rows of a model: every row but the amount being moved.
export function feeRowsOf(model: Pick<FeeSummaryModel, "rows">): FeeRow[] {
  return model.rows.filter((r) => r.key !== "amount");
}

/// `rows` summed per asset in first-seen order; unpriced rows count as zero.
export function sumByAsset(rows: readonly FeeRow[]): { amount: bigint; asset: RowAsset }[] {
  const groups = new Map<string, { amount: bigint; asset: RowAsset }>();
  for (const r of rows) {
    const prev = groups.get(r.asset.symbol);
    groups.set(r.asset.symbol, { amount: (prev?.amount ?? 0n) + (r.amount ?? 0n), asset: r.asset });
  }
  return [...groups.values()];
}

/// Every row carries a figure: the review's Confirm gate. `false` without a model.
export function allPriced(model: FeeSummaryModel | undefined): boolean {
  if (!model) return false;
  return model.rows.every((r) => r.amount !== undefined);
}

/// Fees in USD, or `undefined` if any fee row lacks a figure or a price. `priceOf` is USD per whole token.
export function feeTotalUsd(
  model: FeeSummaryModel | undefined,
  priceOf: (token: string | undefined) => number | undefined,
): number | undefined {
  if (!model) return undefined;
  let sum = 0;
  for (const r of feeRowsOf(model)) {
    if (r.amount === undefined) return undefined;
    const price = priceOf(r.asset.token);
    if (price === undefined) return undefined;
    sum += baseUnitsUsd(r.amount, r.asset.decimals, price);
  }
  return sum;
}
