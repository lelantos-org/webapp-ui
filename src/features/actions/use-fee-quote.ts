// What the relayer charges to relay a spend, and what it will take as payment.
//
// The counterpart to `useFeePreview`, differing from it in two ways:
//
//   * It does not depend on the amount. The relayer prices gas rather than
//     value, so one quote covers every amount of a given kind — no debounce, and
//     no amount in the query key.
//   * It is per-asset. A spend may pay the relayer in an asset it is not
//     otherwise moving, so the quote is a list with one entry per accepted
//     asset, carrying this wallet's balance in each.
//
// A deposit is charged differently: it has no proof to carry a fee slot, so it
// mints a second leaf addressed to the relayer and funds it transparently, with
// the payer pulled `amount + protocolFee + relayerFee` in one Permit2 transfer
// (`resolveDepositFee`). That note is minted in the deposit's own asset, so a
// deposit has no fee-asset choice: quote it with `kind: "deposit"` and read the
// option for the asset being deposited.

import type { FeeOption, FeeQuoteResult } from "@lelantos-org/sdk/wallet";
import { keepPreviousData, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import { useWallet } from "@/features/wallet";

export type { FeeOption, FeeQuoteResult };

/// Operations the relayer prices. All four are charged; only the three spends
/// can choose which asset pays. See the note at the top of this file.
export type FeeQuoteKind = "deposit" | "transfer" | "withdraw" | "swap";

export function useFeeQuote(kind: FeeQuoteKind): UseQueryResult<FeeQuoteResult> {
  const { wallet } = useWallet();
  // Prices are per chain: the same asset id denotes a different token elsewhere,
  // and a relayer may charge on one chain and subsidise another.
  const { chainId } = useActiveChain();

  return useQuery<FeeQuoteResult>({
    queryKey: ["fee-quote", chainId.toString(), kind],
    enabled: !!wallet,
    queryFn: async () => {
      if (!wallet) throw new Error("not ready");
      return wallet.quoteFee({ kind });
    },
    // Gas moves, and the relayer re-derives its requirement when the spend
    // arrives; `shieldedFee.graceBps` is the drift it tolerates between the two.
    // Short enough that a quote shown to the user is one the submit accepts.
    staleTime: 30_000,
    // Switching chain or kind re-keys this query, and without a placeholder
    // `data` would be `undefined` for the round trip, removing the relayer row
    // from the fee panel and restoring it a moment later. The previous chain's
    // price is wrong for the new one, so the panel marks it as being re-priced
    // (`FeePanel.refreshing`) rather than settled.
    placeholderData: keepPreviousData,
  });
}

/// The option paying in `asset`, or `undefined` when the relayer will not accept
/// it, in which case a fee-asset picker must keep it unselectable.
export function feeOptionFor(
  quote: FeeQuoteResult | undefined,
  asset: bigint | undefined,
): FeeOption | undefined {
  if (!quote || asset === undefined) return undefined;
  return quote.options.find((o) => o.asset.id === asset);
}

/// What the relayer takes to flush a deposit of `asset`, in circuit units of
/// that asset.
///
/// A swap's leg 2 is a deposit, so this is also the figure that shrinks the
/// B-note the swap credits: it rides in the same Permit2 pull, and `sizeBNote`
/// takes it as its `relayerFee`. Returns `undefined` while the quote is in
/// flight, letting a caller withhold a credited amount rather than overstate it,
/// and `0n` once the quote reports no charge.
export function useDepositFee(asset: bigint | undefined): bigint | undefined {
  const { data } = useFeeQuote("deposit");
  if (!data || asset === undefined) return undefined;
  return feeOptionFor(data, asset)?.amount ?? 0n;
}

/// A relayer quote joined to the webapp's registry entry for its asset.
///
/// `FeeOption.asset` is the SDK's `AssetInfo`, whose `symbol` and `decimals` are
/// optional: they come from the chain adapter's `tokenMeta` and are absent when
/// it has none. The registry resolves both — falling back to `#<id>` and to
/// `scale` respectively — so joining here keeps that fallback in one place
/// rather than spreading it into fee formatting.
///
/// Returns `undefined` when the registry does not know the asset, which is the
/// same condition under which it cannot be selected to pay in.
export function resolveFeeOption(
  option: FeeOption | undefined,
  registry: readonly { id: bigint; symbol: string; decimals: number; scale: bigint }[],
): { amount: bigint; asset: { symbol: string; decimals: number; scale: bigint } } | undefined {
  if (!option) return undefined;
  const entry = registry.find((a) => a.id === option.asset.id);
  if (!entry) return undefined;
  return {
    amount: option.amount,
    asset: { symbol: entry.symbol, decimals: entry.decimals, scale: entry.scale },
  };
}
