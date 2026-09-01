// What "max" should write into an amount field, and why it sits below the
// balance printed beside it.
//
// Delegates to `wallet.spendableMax`, which reads the same note set as the coin
// selector and applies the same rules. The figure is written into a field the
// selector must then honour, so anything computed independently of it can
// produce an amount the selector refuses as `insufficient unspent value`.

import { assetId, TRANSACT_4X6 } from "@lelantos-org/sdk";
import type { SpendableMax } from "@lelantos-org/sdk/wallet";
import { useQuery } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import { useWallet } from "./use-wallet";
import { useWalletState } from "./use-wallet-state";

export type { SpendableMax };

/// The shape the prover worker is built against. `build-wallet.ts` passes the
/// same constant to `connect`; the two must agree or the max is computed against
/// an arity the circuit does not have.
const N_IN = TRANSACT_4X6.nIn;

export interface SpendableMaxOpts {
  /// The relayer is being paid in an asset this spend is not moving, so
  /// `prepareSpend` reserves one input slot for its cover and leaves `nIn - 1`
  /// for the asset being sent.
  crossAssetFee?: boolean;
  /// Fee taken from this asset, in circuit units. Non-zero only for a same-asset
  /// fee, which comes out of the spend's own target.
  sameAssetFee?: bigint | undefined;
}

/**
 * The largest amount of `asset` a spend can cover right now, and what is
 * holding the rest back.
 *
 * `undefined` while unknown: no wallet, no asset, or the read has not landed.
 * The amount field withholds the max button in that case rather than treating it
 * as zero.
 */
export function useSpendableMax(
  asset: bigint | undefined,
  { crossAssetFee = false, sameAssetFee = 0n }: SpendableMaxOpts = {},
): SpendableMax | undefined {
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  // Keyed on what this asset holds, not on `syncedAt`.
  //
  // `syncedAt` is `Date.now()` written on every successful sync whether or not
  // anything moved, so keying on it minted a fresh cache entry on every poll —
  // and a fresh entry has no data, so the max went `undefined` and back on a
  // timer. Everything downstream flapped with it: `offerableDenominations`
  // reads an unknown ceiling as "no ceiling" and offered the entire ladder, so
  // a wallet too small for any rung watched a full row of chips appear and
  // vanish once per sync.
  //
  // The holdings are what a max actually depends on: the same notes and the same
  // fee arguments cannot produce a different answer. `use-yield-gains.ts` keys
  // itself the same way, for the same reason.
  const held = useWalletState().data?.balances.find((b) => b.asset === asset);
  const holdings = held ? `${held.notes}:${held.balance}` : "none";

  const { data } = useQuery<SpendableMax>({
    queryKey: [
      "spendable-max",
      chainId.toString(),
      wallet?.address ?? null,
      asset?.toString() ?? null,
      holdings,
      crossAssetFee,
      sameAssetFee.toString(),
    ],
    enabled: !!wallet && asset !== undefined,
    queryFn: async () => {
      if (!wallet || asset === undefined) throw new Error("not ready");
      return wallet.spendableMax(assetId(asset), {
        maxInputs: crossAssetFee ? N_IN - 1 : N_IN,
        // `fee`, the same option a spend takes: `selectNotes` covers a same-asset
        // fee by raising the threshold, so the most that can be sent is the
        // ceiling less the fee.
        fee: sameAssetFee,
      });
    },
    // The note file cannot move without the holdings moving, and those are in
    // the key.
    staleTime: Number.POSITIVE_INFINITY,
    // Belt and braces for the keys that legitimately do change under a running
    // form — switching the fee asset moves `crossAssetFee` and `sameAssetFee`.
    // Without this the max blanks for the length of that read, and the ladder
    // below it offers rungs this balance cannot cover in the meantime.
    placeholderData: (prev) => prev,
  });

  return data;
}
