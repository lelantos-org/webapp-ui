// What "max" should write into an amount field, and why it sits below the
// balance printed beside it.
//
// Delegates to `wallet.spendableMax`, which reads the same note set as the coin
// selector and applies the same rules. The figure is written into a field the
// selector must then honour, so anything computed independently of it can
// produce an amount the selector refuses as `insufficient unspent value`.

import type { SpendableMax } from "@lelantos-org/sdk";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import type { FeeKind } from "@/shared/domain/op-kind";
import { queryKeys } from "@/shared/query/keys";
import { useWalletInstance } from "../session/context";
import { useWalletState } from "./use-wallet-state";

export type { SpendableMax };

export interface SpendableMaxOpts {
  /// The spend the max is for. The SDK reserves its relayer fee by the rules the
  /// spend applies: out of the maximum when paid in `asset`, one input slot when
  /// paid in another.
  kind: Exclude<FeeKind, "deposit">;
  /// The asset paying the relayer; `undefined` for the asset being spent.
  feeAsset?: bigint | undefined;
  /// A native-coin withdrawal, priced on its own relayer estimate.
  native?: boolean;
  /// The relayer fee the form is showing, in circuit units. Not sent: it keys the
  /// read, so a re-priced quote re-reads the max it comes out of.
  quotedFee?: bigint | undefined;
}

/// The largest amount of `asset` a spend can cover right now, and what is
/// holding the rest back.
///
/// `undefined` while unknown: no wallet, no asset, or the read has not landed.
/// The amount field withholds the max button in that case rather than treating it
/// as zero.
export function useSpendableMax(
  asset: bigint | undefined,
  { kind, feeAsset, native = false, quotedFee = 0n }: SpendableMaxOpts,
): SpendableMax | undefined {
  const wallet = useWalletInstance();
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
    queryKey: queryKeys.spendableMax(chainId, wallet?.address, asset, holdings, {
      kind,
      feeAsset,
      native,
      quotedFee,
    }),
    queryFn:
      wallet && asset !== undefined
        ? () => wallet.spendableMax(asset, { kind, feeAsset, native })
        : skipToken,
    // The note file cannot move without the holdings moving, and those are in
    // the key.
    staleTime: Number.POSITIVE_INFINITY,
    // Belt and braces for the keys that legitimately do change under a running
    // form — switching the fee asset, or the relayer re-pricing its fee.
    // Without this the max blanks for the length of that read, and the ladder
    // below it offers rungs this balance cannot cover in the meantime.
    placeholderData: (prev) => prev,
  });

  return data;
}
