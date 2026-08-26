// What the relayer charges to relay a spend, and what it will take as payment.
//
// The other half of the fee picture from `useFeePreview`, and it behaves
// differently in two ways worth knowing before using it:
//
//   * **It does not depend on the amount.** The relayer prices gas, not value,
//     so one quote covers every amount of a given kind. No debounce, and the
//     query key carries no amount.
//   * **It is per-asset.** A *spend* may pay the relayer in an asset it is not
//     otherwise moving, so the quote is a list — one entry per asset the
//     relayer accepts — carrying this wallet's balance in each.
//
// A deposit is charged too, and differently: it has no proof to hang a fee
// slot on, so it mints a second leaf addressed to the relayer and funds it
// transparently — the payer is pulled `amount + protocolFee + relayerFee` in
// one Permit2 transfer (`resolveDepositFee`). That note is minted in the
// deposit's own asset, so a deposit has no fee-asset choice: quote it with
// `kind: "deposit"` and read the option for the asset being deposited.

import type { FeeOption, FeeQuoteResult } from "@lelantos-org/sdk/wallet";
import { keepPreviousData, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import { useWallet } from "@/features/wallet";

export type { FeeOption, FeeQuoteResult };

/// Operations the relayer prices. All four are charged; only the three spends
/// can choose which asset pays — see the note at the top of this file.
export type FeeQuoteKind = "deposit" | "transfer" | "withdraw" | "swap";

export function useFeeQuote(kind: FeeQuoteKind): UseQueryResult<FeeQuoteResult> {
  const { wallet } = useWallet();
  // Prices are per chain: the same asset id is different money elsewhere, and
  // a relayer may charge on one chain and subsidise another.
  const { chainId } = useActiveChain();

  return useQuery<FeeQuoteResult>({
    queryKey: ["fee-quote", chainId.toString(), kind],
    enabled: !!wallet,
    queryFn: async () => {
      if (!wallet) throw new Error("not ready");
      return wallet.quoteFee({ kind });
    },
    // Gas moves, and the relayer re-derives its requirement when the spend
    // arrives — `shieldedFee.graceBps` is the drift it will tolerate between
    // the two. Short enough that a quote shown to the user is one the submit
    // will still accept.
    staleTime: 30_000,
    // Switching chain or kind re-keys this query, and without a placeholder
    // `data` goes `undefined` for the round trip — which emptied the relayer
    // row out of the fee panel and put it back a moment later. The previous
    // chain's price is wrong for the new one, so the panel marks it as being
    // re-priced (`FeePanel.refreshing`) rather than presenting it as settled.
    placeholderData: keepPreviousData,
  });
}

/// The option paying in `asset`, or `undefined` when the relayer will not take
/// it — which is the case a fee-asset picker has to keep unselectable.
export function feeOptionFor(
  quote: FeeQuoteResult | undefined,
  asset: bigint | undefined,
): FeeOption | undefined {
  if (!quote || asset === undefined) return undefined;
  return quote.options.find((o) => o.asset.id === asset);
}

/// Whether this spend needs a fee note at all.
///
/// `charged: false` means the relayer subsidises this chain, and the wallet
/// builds no fee slot — so the summary states no relayer fee rather than a
/// zero one, which would read as "we could not price this".
export function feeCharged(quote: FeeQuoteResult | undefined): boolean {
  return quote?.charged === true;
}

/// What the relayer takes to flush a deposit of `asset`, in circuit units of
/// that asset.
///
/// A swap's leg 2 *is* a deposit, so this is also the figure that shrinks the
/// B-note the swap credits: it rides in the same Permit2 pull, and `sizeBNote`
/// takes it as its `relayerFee`. `undefined` while the quote is in flight, so
/// a caller can withhold a credited amount rather than show one overstated by
/// this fee; `0n` once the quote says the relayer does not charge for it.
export function useDepositFee(asset: bigint | undefined): bigint | undefined {
  const { data } = useFeeQuote("deposit");
  if (!data || asset === undefined) return undefined;
  return feeOptionFor(data, asset)?.amount ?? 0n;
}

/// A relayer quote joined to the webapp's registry entry for its asset.
///
/// `FeeOption.asset` is the SDK's `AssetInfo`, whose `symbol` and `decimals`
/// are optional — they come from the chain adapter's `tokenMeta` and are absent
/// when it has none. The registry has already resolved both (falling back to
/// `#<id>` and to `scale` respectively), so joining here keeps the guess in the
/// one place that already owns it instead of spreading it into fee formatting.
///
/// `undefined` when the registry does not know the asset, which is the same
/// condition under which it cannot be selected to pay in.
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
