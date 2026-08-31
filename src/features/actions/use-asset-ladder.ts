// The withdrawal ladder for one asset.
//
// Read through `wallet.asset` rather than from the SDK's built-in table
// directly. The ladder an amount is judged against is whatever
// `WalletConfig.denominations` resolved to, and reading the table here would go
// on offering "10, 20, 50…" to a wallet that opted out or supplied its own —
// steering users onto a ladder the spend path no longer knows about.
// `AssetInfo.ladder` *is* that resolution, which is what makes it worth a round
// trip a pure lookup would not need.
//
// Fixed for the life of the asset: the denominations are circuit-unit integers
// keyed on the ERC-20 address, and unlike the human labels drawn for them they
// do not move with the pool's yield index. Hence the infinite `staleTime` —
// nothing invalidates this short of a chain or asset switch, and both are in the
// key.

import type { Ladder } from "@lelantos-org/sdk/core";
import { useQuery } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import { useWallet } from "@/features/wallet";

/// Shared empty result. A literal `[]` would hand out a fresh array identity on
/// every render while the query is unresolved, invalidating any `useMemo`
/// downstream that lists the ladder as a dependency.
const NO_LADDER: Ladder = [];

/// Withdrawal denominations for `asset`, ascending, in circuit units.
///
/// Empty while the read is in flight, and empty for good on an asset with no
/// ladder. The two are deliberately not distinguished: both mean there is
/// nothing to offer, and a form that rendered a "loading denominations"
/// placeholder would flash it on every asset with none.
export function useAssetLadder(asset: bigint | undefined): Ladder {
  const { wallet } = useWallet();
  // Asset ids are unique only within a chain, so the same id names a different
  // token — and a different ladder — elsewhere.
  const { chainId } = useActiveChain();

  const { data } = useQuery<Ladder>({
    queryKey: ["asset-ladder", chainId.toString(), asset?.toString() ?? null],
    enabled: !!wallet && asset !== undefined,
    queryFn: async () => {
      if (!wallet || asset === undefined) throw new Error("not ready");
      // `AssetRef` accepts a plain bigint id, so nothing needs branding here:
      // `asset` is already the registry id the picker holds.
      return (await wallet.asset(asset)).ladder;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data ?? NO_LADDER;
}
