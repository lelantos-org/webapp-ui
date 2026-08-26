// What "max" should write into an amount field, and why it sits below the
// balance printed beside it.
//
// Delegates to `wallet.spendableMax`, which reads the same note set the coin
// selector reads and applies the same rules. That is the whole point: this
// figure is written into a field the selector then has to honour, so anything
// computed independently of it can — and did — produce an amount the selector
// refuses, reported to the user as `insufficient unspent value`.

import { assetId, TRANSACT_4X4 } from "@lelantos-org/sdk";
import type { SpendableMax } from "@lelantos-org/sdk/wallet";
import { useQuery } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import { useWallet } from "./use-wallet";
import { useWalletState } from "./use-wallet-state";

export type { SpendableMax };

/// The shape the prover worker is built against — `build-wallet.ts` passes the
/// same constant to `connect`, and the two must agree or the max is computed
/// against an arity the circuit does not have.
const N_IN = TRANSACT_4X4.nIn;

export interface SpendableMaxOpts {
  /// The relayer is being paid in an asset this spend is not moving, so
  /// `prepareSpend` reserves one input slot for its cover and leaves `nIn - 1`
  /// for the asset being sent.
  crossAssetFee?: boolean;
  /// Fee taken from *this* asset, in circuit units. Non-zero only for a
  /// same-asset fee, which comes out of the spend's own target.
  sameAssetFee?: bigint | undefined;
}

/**
 * The largest amount of `asset` a spend can cover right now, and what is
 * holding the rest back.
 *
 * `undefined` while unknown — no wallet, no asset, or the read has not landed
 * — which the amount field reads as "withhold the max button" rather than as
 * zero.
 */
export function useSpendableMax(
  asset: bigint | undefined,
  { crossAssetFee = false, sameAssetFee = 0n }: SpendableMaxOpts = {},
): SpendableMax | undefined {
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  // Not for its balances — for its `syncedAt`, which is the moment the note
  // file last changed. Also means this inherits the sync's invalidation, so a
  // completed transfer refreshes the max without a second poll.
  const syncedAt = useWalletState().data?.syncedAt;

  const { data } = useQuery<SpendableMax>({
    queryKey: [
      "spendable-max",
      chainId.toString(),
      wallet?.address ?? null,
      asset?.toString() ?? null,
      syncedAt ?? null,
      crossAssetFee,
      sameAssetFee.toString(),
    ],
    enabled: !!wallet && asset !== undefined,
    queryFn: async () => {
      if (!wallet || asset === undefined) throw new Error("not ready");
      return wallet.spendableMax(assetId(asset), {
        maxInputs: crossAssetFee ? N_IN - 1 : N_IN,
        // `fee`, the same option a spend takes: `selectNotes` covers a
        // same-asset fee by raising the threshold, so the most that can be
        // *sent* is the ceiling less the fee.
        fee: sameAssetFee,
      });
    },
    // The note file only moves when a sync does, and `syncedAt` is in the key.
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data;
}
