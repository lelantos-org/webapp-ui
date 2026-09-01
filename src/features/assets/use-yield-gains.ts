// The React binding for `yield-index.ts` / `yield-gains.ts`.

import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { useQuery } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import { useWallet, useWalletState } from "@/features/wallet";
import { NO_GAINS, type YieldGains } from "./yield-gains";
import { resolveGains } from "./yield-index";

/**
 * A fingerprint of the wallet's holdings, for the query key.
 *
 * Not `syncedAt`: that is `Date.now()` written on every successful sync whether
 * or not anything moved, so keying on it mints a fresh cache entry every poll —
 * blanking the column to `—` and back, re-reading the note set, and defeating
 * the `memo` on the table's rows. The balances array only changes when holdings
 * do, which is the only thing a basis depends on.
 */
function holdingsKey(balances: readonly { asset: bigint; balance: bigint; notes: number }[]) {
  return balances.map((b) => `${b.asset}:${b.notes}:${b.balance}`).join("|");
}

/**
 * Unrealised yield per asset for the connected wallet.
 *
 * Recomputes when the holdings change, not on the balance poll's cadence — see
 * {@link holdingsKey}. The historical reads behind it are cached permanently, so
 * a repeat is cheap: only blocks seen for the first time cost a call.
 *
 * Never surfaces an error. Every failure mode — no archive state, an
 * unreachable node, an asset with no yield — degrades to an absent or partial
 * entry, and the portfolio renders without it.
 */
export function useYieldGains(): YieldGains {
  const { wallet } = useWallet();
  const chain = useActiveChain();
  const balances = useWalletState().data?.balances;

  const query = useQuery({
    queryKey: [
      "yield-gains",
      chain.chainId.toString(),
      wallet?.address ?? null,
      balances ? holdingsKey(balances) : null,
    ],
    enabled: wallet !== undefined && balances !== undefined,
    // The note set behind it cannot change without the holdings changing, and
    // that is in the key, so a settled entry is never stale.
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () =>
      resolveGains({
        chainId: chain.chainId,
        rpcUrl: chain.rpcUrl,
        maspAddress: chain.maspAddress,
        // Non-null by `enabled`: the query does not run without a wallet.
        notes: (wallet as WalletApi).notes({ spent: false }),
        assets: chain.tokens,
      }),
  });

  // No `useMemo`: react-query keeps `data` referentially stable between renders
  // and `NO_GAINS` is a module constant, so there is no identity to preserve.
  return query.data ?? NO_GAINS;
}
