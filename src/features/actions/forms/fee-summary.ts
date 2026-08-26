// The fee summary's data model: every charge a spend carries, as ordered rows.
//
// Two things make this more than a subtraction.
//
// **Two fees, charged by different parties, out of different pockets.** The
// protocol fee is skimmed by the contract off the transparent leg — `publicIn`
// on a deposit, `publicOut` on a withdraw — so it moves the figure the user
// reads as "paid" or "received".
//
// Where the relayer's fee lands depends on the kind, and the two cases are not
// interchangeable:
//
//   * On a **spend**, it is an output note inside the proof, funded from the
//     sender's own change. It never touches the amount the counterparty sees —
//     a transfer's recipient gets exactly what was typed — and comes off the
//     sender's shielded balance instead.
//   * On a **deposit**, there is no proof to hang a slot on, so the depositor
//     mints a second leaf addressed to the relayer and funds it transparently:
//     Permit2 pulls `amount + protocolFee + relayerFee` in one transfer
//     (`resolveDepositFee`). Here it *is* part of what leaves the wallet, so
//     it belongs in the headline.
//
// Presenting them as one number would be wrong in both directions.
//
// **Two unit systems.** `feeBreakdown` works in token base units; a relayer
// quote is in circuit units. Base units are the common denominator here
// because circuit → base is an exact multiply by `scale`, where the reverse is
// a truncating divide — so every row is normalised on the way in and formatted
// by its own asset's `decimals`.
//
// **Two assets, possibly.** A spend may pay the relayer in an asset it is not
// moving, so fee rows are not always summable. `total` is present only when
// every fee shares one asset; otherwise the rows stand alone rather than being
// added into a figure that means nothing. A deposit is never in this case: its
// relayer note is minted in the deposited asset or the SDK refuses to build.
//
// **Two arrival times.** The two fees are fetched by queries with different
// keys and different latencies — the protocol fee is debounced against the
// amount field, the relayer quote is not — so the set of rows was changing
// under the reader as each landed. A row whose charge is known to apply is
// therefore emitted with `amount: undefined` rather than left out, and the
// renderer draws a placeholder in its place. The panel settles on its shape as
// soon as the *kind* and the *paying asset* are known, both of which are known
// immediately; only the figures fill in afterwards.

import type { FeeBreakdown } from "@/shared/lib/fees";

export type FeeKind = "deposit" | "transfer" | "withdraw" | "swap";

/// The asset facts a row needs to render itself.
export interface RowAsset {
  symbol: string;
  decimals: number;
}

/// One line of the summary. `amount` is always token **base units** of
/// `asset`, and always non-negative — direction is the renderer's business,
/// driven by `sign`.
export interface FeeRow {
  key: string;
  label: string;
  /// `undefined` where the charge is known to apply but the figure pricing it
  /// has not landed. The row is emitted anyway, with the renderer drawing a
  /// placeholder: a panel that grows a line each time a query resolves moves
  /// the submit button out from under the pointer, and the amount field is
  /// debounced, so that happened on most keystrokes.
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
  /// fee, where no single figure is true.
  total: FeeRow | undefined;
  /// The bottom line, and what it means for this kind. Absent on a swap, whose
  /// `QuoteCard` already states what the wallet is credited.
  headline: FeeRow | undefined;
  /// True when the relayer is paid in an asset the spend is not moving, which
  /// the panel calls out — it is spent from a balance the user was not
  /// otherwise touching.
  crossAsset: boolean;
}

export interface FeeSummaryInput {
  kind: FeeKind;
  /// The typed amount in circuit units, and the asset it is in. `undefined`
  /// while the field is empty or mid-edit.
  amount: bigint | undefined;
  spendAsset: { symbol: string; decimals: number; scale: bigint } | undefined;
  /// Protocol fee, already settled. Absent when the chain charges none, or
  /// while the debounced preview is catching up.
  protocol: FeeBreakdown | undefined;
  /// The relayer's charge, in circuit units of `asset`. Absent when the
  /// relayer subsidises this chain, or while the quote is loading.
  ///
  /// Resolved against the webapp's own registry rather than taken off the
  /// SDK's `FeeOption`: `AssetInfo.decimals` is optional there — the SDK is
  /// explicit that human-unit conversion is undefined without it — and a fee
  /// row formatted against a guessed `decimals` is off by orders of magnitude,
  /// which is worse than the missing row this change set out to fix. See
  /// `resolveFeeOption`.
  relayer:
    | { amount: bigint; asset: { symbol: string; decimals: number; scale: bigint } }
    | undefined;
  /// The pool's rate, in basis points.
  ///
  /// Read per chain rather than per amount (`useFeeBps`), so it is already
  /// cached by the time a form renders — which is the point of taking it: it
  /// labels the protocol row correctly before `protocol` has priced anything,
  /// and `0n` says the pool charges nothing so the row is never drawn.
  feeBps?: bigint | undefined;
  /// The caller has a protocol-fee read in flight and will fill `protocol` in.
  ///
  /// Required rather than inferred, because "no breakdown" does not mean "one
  /// is coming": a swap is charged a protocol fee and deliberately passes
  /// none, its `QuoteCard` already stating the credited amount. Inferring from
  /// `feeBps` alone would leave that panel holding a line open forever.
  protocolPending?: boolean;
  /// The asset the relayer will be paid in, where that is settled before the
  /// quote pricing it arrives — it comes from the fee picker, which is the
  /// user's choice, not the relayer's answer. Lets the relayer row hold its
  /// place, labelled with the right token, while the figure is in flight.
  relayerAsset?: RowAsset | undefined;
}

/// Whose pocket the protocol fee comes out of, per kind.
///
/// A deposit is charged it on top of the escrowed amount; a withdraw and a
/// swap have it skimmed off the transparent leg. A transfer has no transparent
/// leg at all, so `MASP._takeFee` never runs and there is no protocol fee to
/// state — which is why `FeeMode` has no `"transfer"`.
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

function headlineLabel(kind: FeeKind): string | undefined {
  switch (kind) {
    case "deposit":
      return "You pay";
    case "withdraw":
      return "You receive";
    case "transfer":
      return "Recipient gets";
    // The quote panel above already states the credited amount, and repeating
    // it here would invite the two to disagree.
    case "swap":
      return undefined;
  }
}

/// The protocol row, or `undefined` where this spend is charged nothing.
///
/// Two different "no fee"s are being told apart here. A settled breakdown of
/// zero is an answer — the pool takes nothing on this amount — and gets no
/// row, because "0.00" reads as "we could not price this". No breakdown *at
/// all* is not an answer: if one is on its way and the pool charges basis
/// points, the row opens now and waits for the figure rather than appearing
/// once it lands.
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

  // The settled breakdown's own rate where there is one, so the label cannot
  // disagree with the figure beside it.
  const bps = protocol?.feeBps ?? feeBps;
  if (!protocol && (!pending || bps === undefined || bps === 0n)) return undefined;

  // Basis points as a percentage, at the precision the pool actually
  // configures — `30 bps` reads as `0.30%`.
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
/// `relayerAsset` is the placeholder path: the paying asset is the user's
/// choice and so is known immediately, while the amount is the relayer's
/// answer and is not.
function relayerRowFor(
  relayer: FeeSummaryInput["relayer"],
  relayerAsset: RowAsset | undefined,
): FeeRow | undefined {
  const asset = relayer
    ? { symbol: relayer.asset.symbol, decimals: relayer.asset.decimals }
    : relayerAsset;
  if (!asset) return undefined;
  // A quote of zero is the subsidised chain's answer, not a missing figure.
  if (relayer && relayer.amount <= 0n) return undefined;
  return {
    key: "relayer",
    label: "Relayer fee",
    amount: relayer ? relayer.amount * relayer.asset.scale : undefined,
    asset,
    // Never `minus`, on either path: on a deposit it is pulled on top of the
    // amount, and on a spend it is funded from the sender's change rather
    // than skimmed off the amount. Neither reduces what the counterparty
    // receives.
    sign: "plus",
  };
}

/// The bottom line, or `undefined` while a charge that moves it is still being
/// priced — better a placeholder than a figure that changes under the reader
/// a moment after they have read it.
function headlineAmount(
  kind: FeeKind,
  base: bigint,
  protocolFee: bigint | undefined,
  relayerFee: bigint | undefined,
): bigint | undefined {
  if (protocolFee === undefined) return undefined;
  // A deposit's headline is what Permit2 pulls, so it carries both fees. A
  // withdraw's and a transfer's is what the counterparty ends up with, which
  // the relayer fee never touches: it is funded from shielded change, not from
  // the transparent leg or the recipient's note.
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

  const base = amount * spendAsset.scale;
  const rows: FeeRow[] = [
    { key: "amount", label: "Amount", amount: base, asset: spendAsset, sign: "none" },
  ];

  const protocolRow = protocolRowFor(kind, spendAsset, protocol, feeBps, protocolPending);
  if (protocolRow) rows.push(protocolRow);
  const relayerRow = relayerRowFor(relayer, relayerAsset);
  if (relayerRow) rows.push(relayerRow);

  const crossAsset = !!relayerRow && relayerRow.asset.symbol !== spendAsset.symbol;

  // Summable only in one asset. A cross-asset fee has no meaningful total, and
  // inventing one by adding raw base units of different tokens would be a
  // number that looks right and is nonsense.
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
          // A row that does not exist charges nothing, which is a known zero;
          // a row that exists without a figure is the unknown one.
          protocolRow ? protocolRow.amount : 0n,
          relayerRow ? relayerRow.amount : 0n,
        ),
        asset: spendAsset,
        sign: "none" as const,
      }
    : undefined;

  return { rows, total, headline, crossAsset };
}
