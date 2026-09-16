// What stops the relayer from being paid, decided before the proof.
//
// Three cases, each of which would otherwise let a spend reach the prover —
// twenty to forty seconds of work — and come back with an error that does not
// say the fee was the problem:
//
//   * The paying asset cannot cover the charge. The picker refuses to *select*
//     an unaffordable asset, but the default is whatever is being sent.
//   * The quote failed. With no quote there is no shortfall to report, so the
//     panel would read as fine.
//   * The relayer charges, but quotes no option for the paying asset:
//     `options.find` comes back empty.
//
// Pure, so the three cases and their precedence are testable without a query.

import type { AssetLabel, AssetUnits } from "@/shared/domain/units";

/// One asset the relayer will take, joined to the registry entry that lets the
/// picker render it.
///
/// Amounts are circuit units, as the SDK quotes them; the picker scales them for
/// display with `scale`.
///
/// Carries the asset's full units, `index` included, for the same reason
/// `resolveFeeOption` does: `amount` and `balance` are circuit units, and a
/// yield asset's unit is worth more than `scale`. Sourced from the registry
/// entry — which always has an index — so no conversion here has to decide what
/// an absent one means.
export type FeeAssetOption = FeeAssetPrice & FeeAssetFunding;

/// An option less its funding: the asset, and what the relay costs in it.
interface FeeAssetPrice extends AssetUnits, Pick<AssetLabel, "symbol"> {
  id: bigint;
  /// What the relay costs when paid in this asset.
  amount: bigint;
}

/// What this wallet holds of an option's asset, and whether that covers it.
export type FeeAssetFunding =
  | {
      /// The balance the fee is paid from: unspent notes for a spend, the public
      /// wallet (less what the same token also funds) for a deposit.
      balance: bigint;
      /// Whether `balance` covers `amount`. Necessary but not sufficient on a
      /// spend: the notes must also fit the circuit's input slots, which only
      /// coin selection can decide. See `FeeOption.affordable`.
      affordable: boolean;
    }
  /// Not read yet, or unreadable. Selectable, since unknown is not short, and
  /// stated as unknown rather than as a zero balance.
  | { balance: undefined; affordable: true };

export interface FeeAssetChoice {
  /// What the relayer will take, with this wallet's balance in each.
  options: FeeAssetOption[];
  /// Currently selected fee asset id.
  value: bigint | undefined;
  onChange(asset: bigint): void;
}

/// An asset the user holds enough of to pay the relayer instead.
export interface FeeAlternative {
  id: bigint;
  symbol: string;
}

/// The paying asset cannot cover the relayer's charge, with the figures the
/// warning states and the asset that could.
///
/// The paying asset's option as the picker holds it — `id` is the asset set to
/// pay, `amount` what the relay costs in it and `balance` what this wallet
/// holds, both circuit units — less the verdict, which is the reason this
/// exists.
export interface FeeShortfall extends FeeAssetPrice {
  balance: bigint;
  /// An asset they do hold enough of, if the relayer quoted one. Absent means
  /// topping up is the only way out, which the message has to admit.
  alternative: FeeAlternative | undefined;
}

export type FeeBlock =
  | ({ kind: "shortfall" } & FeeShortfall)
  /// The quote could not be read. `retry` refetches it.
  | { kind: "quote-failed"; error: unknown; retry(): void; alternative?: undefined }
  /// The relayer charges, but not in this asset. `symbol` is absent when the
  /// paying asset is not in the registry either.
  | { kind: "not-accepted"; symbol: string | undefined; alternative: FeeAlternative | undefined };

export interface FeeBlockInputs {
  /// No asset to pay with yet — nothing typed or no registry. Nothing to block.
  payingWith: bigint | undefined;
  payingSymbol: string | undefined;
  /// The quote's `charged`, or `undefined` while there is no quote.
  charged: boolean | undefined;
  /// The relayer's options joined to the registry, as the picker shows them.
  options: readonly FeeAssetOption[];
  /// The quote query failed.
  error: unknown;
  retry(): void;
}

/// The problem with paying the relayer, or `undefined` when there is none or
/// nothing can be said yet.
///
/// A failed quote outranks the others: its `options` are either missing or the
/// last good ones, and neither is evidence about today's charge. An in-flight
/// quote is not a block — unknown is not the same as short — and is reported by
/// `FeePanel.pending` instead.
export function feeBlockFor(input: FeeBlockInputs): FeeBlock | undefined {
  const { payingWith, payingSymbol, charged, options, error, retry } = input;
  if (payingWith === undefined) return undefined;
  if (error) return { kind: "quote-failed", error, retry };
  if (charged !== true) return undefined;

  const alternativeTo = (id: bigint): FeeAlternative | undefined => {
    const o = options.find((x) => x.affordable && x.id !== id);
    return o ? { id: o.id, symbol: o.symbol } : undefined;
  };

  const pays = options.find((o) => o.id === payingWith);
  if (!pays) {
    return { kind: "not-accepted", symbol: payingSymbol, alternative: alternativeTo(payingWith) };
  }
  if (pays.affordable) return undefined;
  const { affordable: _, ...short } = pays;
  return { kind: "shortfall", ...short, alternative: alternativeTo(pays.id) };
}

/// The block as the sentence under a disabled submit button.
///
/// Names the fee asset every time: "not enough for the fee" leaves the user to
/// work out which balance fell short, and on a cross-asset fee it is not the one
/// the amount field shows.
export function feeBlockReason(block: FeeBlock): string {
  switch (block.kind) {
    case "shortfall":
      return block.alternative
        ? `Not enough ${block.symbol} to pay the relayer fee — pay it in ${block.alternative.symbol} instead`
        : `Not enough ${block.symbol} to pay the relayer fee`;
    case "quote-failed":
      return "Couldn't get the relayer's fee — try again";
    case "not-accepted": {
      const which = block.symbol ?? "this asset";
      return block.alternative
        ? `The relayer doesn't take ${which} for its fee — pay it in ${block.alternative.symbol} instead`
        : `The relayer doesn't take ${which} for its fee`;
    }
  }
}
