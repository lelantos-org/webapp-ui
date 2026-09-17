import type { AssetLabel, AssetUnits } from "@/shared/domain/units";

/// A relayer-accepted asset joined to its registry entry. Amounts are circuit units; `index` included.
export type FeeAssetOption = FeeAssetPrice & FeeAssetFunding;

interface FeeAssetPrice extends AssetUnits, Pick<AssetLabel, "symbol"> {
  id: bigint;
  amount: bigint;
}

/// This wallet's holding of an option's asset, and whether it covers the fee.
export type FeeAssetFunding =
  | {
      /// Unspent notes for a spend; the public wallet (less principal) for a deposit.
      balance: bigint;
      /// `balance` covers `amount`. On a spend, coin selection may still fail.
      affordable: boolean;
    }
  /// Not read yet: selectable, and shown as unknown rather than zero.
  | { balance: undefined; affordable: true };

/// The fee asset picker's options and selection.
export interface FeeAssetChoice {
  options: FeeAssetOption[];
  value: bigint | undefined;
  onChange(asset: bigint): void;
}

/// An asset the user holds enough of to pay the relayer instead.
export interface FeeAlternative {
  id: bigint;
  symbol: string;
}

/// The paying asset cannot cover the relayer's charge; amounts and `balance` in circuit units.
export interface FeeShortfall extends FeeAssetPrice {
  balance: bigint;
  /// An affordable asset to pay in instead; absent means topping up is the only way out.
  alternative: FeeAlternative | undefined;
}

/// Why the relayer cannot be paid, decided before proving.
export type FeeBlock =
  | ({ kind: "shortfall" } & FeeShortfall)
  | { kind: "quote-failed"; error: unknown; retry(): void; alternative?: undefined }
  | { kind: "not-accepted"; symbol: string | undefined; alternative: FeeAlternative | undefined };

/// Inputs to `feeBlockFor`.
export interface FeeBlockInputs {
  /// `undefined` when there is no asset to pay with yet.
  payingWith: bigint | undefined;
  payingSymbol: string | undefined;
  /// The quote's `charged`; `undefined` while there is no quote.
  charged: boolean | undefined;
  options: readonly FeeAssetOption[];
  error: unknown;
  retry(): void;
}

/// The problem with paying the relayer, if any. A failed quote outranks the others; in-flight is not a block.
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

/// The block as the sentence under a disabled submit button, always naming the fee asset.
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
