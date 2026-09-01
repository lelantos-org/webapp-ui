// The fee summary's data model: every charge a spend carries, as ordered rows.
//
// Four properties shape the model.
//
// **Two fees, charged by different parties, out of different pockets.** The
// contract skims the protocol fee off the transparent leg — `publicIn` on a
// deposit, `publicOut` on a withdraw — so it moves the figure the user reads as
// "paid" or "received". Where the relayer's fee lands depends on the kind:
//
//   * On a spend it is an output note inside the proof, funded from the sender's
//     own change, so it comes off the sender's shielded balance and never
//     affects what the counterparty receives.
//   * On a deposit there is no proof to carry the slot, so the depositor mints a
//     second leaf addressed to the relayer and funds it transparently: Permit2
//     pulls `amount + protocolFee + relayerFee` in one transfer
//     (`resolveDepositFee`). It leaves the wallet, so it belongs in the
//     headline.
//
// **Two unit systems.** `feeBreakdown` works in token base units, a relayer
// quote in circuit units. Base units are the common denominator, since
// circuit → base is a multiply while the reverse is a truncating divide. Every
// row is normalised on the way in by `toBaseUnits` and formatted by its own
// asset's `decimals`.
//
// That conversion must carry the asset's yield index: a unit of a yield asset is
// worth `scale * index / RAY`, so scaling by `scale` alone states the amount as
// it was when the notes were credited. On a withdraw the headline is
// `amount − protocolFee` and `feeBreakdown` prices the fee against the indexed
// amount, so omitting the index here subtracts a fee sized for today's value
// from a figure sized for the deposit's.
//
// **Two assets, possibly.** A spend may pay the relayer in an asset it is not
// moving, so fee rows are not always summable; `total` is present only when
// every fee shares one asset. A deposit is never in this case, its relayer note
// being minted in the deposited asset or the SDK refusing to build.
//
// **Two arrival times.** The two fees are fetched by queries with different keys
// and latencies: the protocol fee is debounced against the amount field, the
// relayer quote is not. A row whose charge is known to apply is therefore
// emitted with `amount: undefined` rather than omitted, and the renderer draws a
// placeholder, so the panel's shape is fixed once the kind and paying asset are
// known and only the figures fill in afterwards.

import type { FeeBreakdown, FeeMode } from "@/shared/lib/fees";
import { type AssetUnits, toBaseUnits } from "@/shared/lib/format";

export type FeeKind = "deposit" | "transfer" | "withdraw" | "swap";

/// The asset facts a row needs to render itself.
export interface RowAsset {
  symbol: string;
  decimals: number;
}

/// An asset an amount is converted against: a `RowAsset` plus the factors taking
/// circuit units to base units.
export interface ConvertAsset extends RowAsset, Omit<AssetUnits, "decimals"> {}

/// One line of the summary. `amount` is always token base units of `asset` and
/// always non-negative; direction is carried by `sign` and applied by the
/// renderer.
export interface FeeRow {
  key: string;
  label: string;
  /// `undefined` where the charge is known to apply but the figure pricing it
  /// has not landed. The row is still emitted and the renderer draws a
  /// placeholder, so the panel does not grow a line — and shift the submit
  /// button — as each debounced query resolves.
  amount: bigint | undefined;
  asset: RowAsset;
  /// How the row reads against the amount above it. `none` is used for the
  /// amount row itself and for headlines.
  sign: "none" | "minus" | "plus";
}

export interface FeeSummaryModel {
  /// The amount being moved, and the fees charged on it.
  rows: FeeRow[];
  /// Sum of the fee rows, when they share an asset. Absent for a cross-asset
  /// fee, which has no single meaningful total.
  total: FeeRow | undefined;
  /// The bottom line for this kind. Absent on a swap, whose `QuoteCard` already
  /// states the credited amount.
  headline: FeeRow | undefined;
  /// True when the relayer is paid in an asset the spend is not moving. The
  /// panel calls this out, since it draws on a balance the user is not
  /// otherwise touching.
  crossAsset: boolean;
}

export interface FeeSummaryInput {
  kind: FeeKind;
  /// The typed amount in circuit units, and the asset it is in. `undefined`
  /// while the field is empty or mid-edit.
  amount: bigint | undefined;
  spendAsset: ConvertAsset | undefined;
  /// Protocol fee, already settled. Absent when the chain charges none, or
  /// while the debounced preview is catching up.
  protocol: FeeBreakdown | undefined;
  /// The relayer's charge, in circuit units of `asset`. Absent when the
  /// relayer subsidises this chain, or while the quote is loading.
  ///
  /// Resolved against the webapp's own registry rather than the SDK's
  /// `FeeOption`, whose `AssetInfo.decimals` is optional and leaves human-unit
  /// conversion undefined; a row formatted against a guessed `decimals` is off
  /// by orders of magnitude. See `resolveFeeOption`.
  relayer: { amount: bigint; asset: ConvertAsset } | undefined;
  /// The asset's rate for this kind's leg, in basis points.
  ///
  /// Read per asset and per leg rather than per amount (`useAssetFeeBps`), so it
  /// is cached by the time a form renders. It labels the protocol row before
  /// `protocol` has priced anything; `0n` suppresses the row entirely.
  feeBps?: bigint | undefined;
  /// The caller has a protocol-fee read in flight and will fill `protocol` in.
  ///
  /// Passed explicitly rather than inferred from a missing breakdown: a swap is
  /// charged a protocol fee but passes none, its `QuoteCard` already stating the
  /// credited amount. Inferring from `feeBps` would hold a line open on that
  /// panel indefinitely.
  protocolPending?: boolean;
  /// The asset the relayer will be paid in. Comes from the fee picker, so it is
  /// settled before the quote pricing it arrives, letting the relayer row hold
  /// its place with the correct token while the figure is in flight.
  relayerAsset?: RowAsset | undefined;
}

/// Whose pocket the protocol fee comes out of, per kind.
///
/// A deposit is charged it on top of the escrowed amount; a withdraw and a swap
/// have it skimmed off the transparent leg. A transfer has no transparent leg
/// and so no protocol fee, hence no `"transfer"` in `FeeMode`.
function protocolSign(kind: FeeKind): "plus" | "minus" | undefined {
  switch (kind) {
    case "deposit":
      return "plus";
    case "withdraw":
    case "swap":
      return "minus";
    case "transfer":
      return undefined;
  }
}

/// Which of the asset's two rates a kind is charged at.
///
/// Switched on `kind` directly rather than read off `protocolSign`. The two
/// agree today, but `protocolSign` picks a `+`/`−` glyph, and letting a
/// presentation choice decide which rate is read from chain means a kind
/// rendered unsigned would silently change the query. Rates are per asset and
/// per leg and differ routinely, so reading the wrong one labels the row with a
/// percentage the figure beside it will not match.
///
/// `transfer` gets no protocol row, so its mode is never read; it is mapped
/// rather than left to a default so adding a kind is a compile error here.
export function feeModeFor(kind: FeeKind): FeeMode {
  switch (kind) {
    case "deposit":
      return "deposit";
    case "withdraw":
    case "swap":
    case "transfer":
      return "withdraw";
  }
}

function headlineLabel(kind: FeeKind): string | undefined {
  switch (kind) {
    case "deposit":
      return "You pay";
    case "withdraw":
      return "You receive";
    case "transfer":
      return "Recipient gets";
    // The quote panel above already states the credited amount; repeating it
    // here risks the two disagreeing.
    case "swap":
      return undefined;
  }
}

/// The protocol row, or `undefined` where this spend is charged nothing.
///
/// Two absences are distinguished. A settled breakdown of zero means the pool
/// takes nothing and gets no row, since "0.00" reads as a failed pricing. No
/// breakdown with a pending read and a non-zero rate opens the row immediately
/// and waits for the figure.
function protocolRowFor(
  kind: FeeKind,
  spendAsset: RowAsset,
  protocol: FeeBreakdown | undefined,
  feeBps: bigint | undefined,
  pending: boolean,
): FeeRow | undefined {
  const sign = protocolSign(kind);
  if (!sign) return undefined;
  if (protocol && protocol.fee <= 0n) return undefined;

  // Prefer the settled breakdown's own rate, so the label cannot disagree with
  // the figure beside it.
  const bps = protocol?.feeBps ?? feeBps;
  if (!protocol && (!pending || bps === undefined || bps === 0n)) return undefined;

  // Basis points as a percentage, at the precision the pool configures: 30 bps
  // renders as `0.30%`.
  const pct = bps === undefined ? "" : ` (${(Number(bps) / 100).toFixed(2)}%)`;
  return {
    key: "protocol",
    label: `Protocol fee${pct}`,
    amount: protocol?.fee,
    asset: spendAsset,
    sign,
  };
}

/// The relayer row, or `undefined` where the relayer subsidises this spend.
///
/// `relayerAsset` drives the placeholder path: the paying asset is the user's
/// choice and known immediately, while the amount is the relayer's answer.
function relayerRowFor(
  relayer: FeeSummaryInput["relayer"],
  relayerAsset: RowAsset | undefined,
): FeeRow | undefined {
  const asset = relayer
    ? { symbol: relayer.asset.symbol, decimals: relayer.asset.decimals }
    : relayerAsset;
  if (!asset) return undefined;
  // A quote of zero is a subsidised chain's answer, not a missing figure.
  if (relayer && relayer.amount <= 0n) return undefined;
  return {
    key: "relayer",
    label: "Relayer fee",
    amount: relayer
      ? toBaseUnits(relayer.amount, relayer.asset.scale, relayer.asset.index)
      : undefined,
    asset,
    // Never `minus`: on a deposit it is pulled on top of the amount, and on a
    // spend it is funded from the sender's change. Neither reduces what the
    // counterparty receives.
    sign: "plus",
  };
}

/// The bottom line, or `undefined` while a charge that moves it is still being
/// priced, so the renderer shows a placeholder rather than a figure that
/// changes moments later.
function headlineAmount(
  kind: FeeKind,
  base: bigint,
  protocolFee: bigint | undefined,
  relayerFee: bigint | undefined,
): bigint | undefined {
  if (protocolFee === undefined) return undefined;
  // A deposit's headline is what Permit2 pulls and carries both fees. A
  // withdraw's and a transfer's is what the counterparty ends up with, which
  // the relayer fee does not affect: it is funded from shielded change, not
  // from the transparent leg or the recipient's note.
  if (kind !== "deposit") return base - protocolFee;
  if (relayerFee === undefined) return undefined;
  return base + protocolFee + relayerFee;
}

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

  const base = toBaseUnits(amount, spendAsset.scale, spendAsset.index);
  const rows: FeeRow[] = [
    { key: "amount", label: "Amount", amount: base, asset: spendAsset, sign: "none" },
  ];

  const protocolRow = protocolRowFor(kind, spendAsset, protocol, feeBps, protocolPending);
  if (protocolRow) rows.push(protocolRow);
  const relayerRow = relayerRowFor(relayer, relayerAsset);
  if (relayerRow) rows.push(relayerRow);

  const crossAsset = !!relayerRow && relayerRow.asset.symbol !== spendAsset.symbol;

  // Summable only within one asset: adding raw base units of different tokens
  // would produce a plausible-looking but meaningless figure.
  const feeRows = rows.filter((r) => r.key !== "amount");
  const total =
    feeRows.length > 1 && !crossAsset
      ? {
          key: "total",
          label: "Total fees",
          // One unpriced row makes the sum unknown, not zero.
          amount: feeRows.some((r) => r.amount === undefined)
            ? undefined
            : feeRows.reduce((a, r) => a + (r.amount ?? 0n), 0n),
          asset: spendAsset,
          sign: "none" as const,
        }
      : undefined;

  const label = headlineLabel(kind);
  const headline = label
    ? {
        key: "headline",
        label,
        amount: headlineAmount(
          kind,
          base,
          // An absent row charges a known zero; a row present without a figure
          // is the unknown case.
          protocolRow ? protocolRow.amount : 0n,
          relayerRow ? relayerRow.amount : 0n,
        ),
        asset: spendAsset,
        sign: "none" as const,
      }
    : undefined;

  return { rows, total, headline, crossAsset };
}
