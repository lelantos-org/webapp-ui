// Which chain the app is on — decided by the connected wallet, not by the app.
//
// There is deliberately no in-app chain selection. A dropdown here would make
// two sources of truth: the app would claim one chain while the wallet sat on
// another, balances would follow the app, and the disagreement would only
// surface as a surprise switch prompt at submit. Reading the wallet's network
// instead means the two can never disagree, and the user switches chains where
// they already know how — in their wallet. `ChainSwitchButtons` drives that
// from inside the app when it is useful, but it moves the *wallet*, not a
// separate app-level setting.
//
// A chain the registry does not describe leaves `active` undefined. That is a
// real state — the wallet is somewhere this deployment cannot serve — and it
// is surfaced as the `unsupported-chain` wallet status rather than papered
// over with a default.

import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { type ChainEntry, findChain, loadChainRegistry } from "@/config/chains";
import { useWalletStore } from "@/features/eip1193/use-store";

export const chainRegistryKey = ["chain-registry"] as const;

interface ChainContextValue {
  registry: ChainEntry[];
  /// The wallet's network, when this deployment serves it. `undefined` when no
  /// wallet is connected, or when it is on a chain outside the registry.
  active: ChainEntry | undefined;
}

const ChainContext = createContext<ChainContextValue | undefined>(undefined);

export function ChainProvider({ children }: { children: ReactNode }) {
  const registryQuery = useQuery({
    queryKey: chainRegistryKey,
    queryFn: loadChainRegistry,
    // The set of deployed chains does not move under a running tab, and every
    // wallet-facing read depends on it, so refetching only churns.
    staleTime: Number.POSITIVE_INFINITY,
    // The whole app is behind this. A single failed attempt should not require
    // a page reload to get past, and the retry button below covers what these
    // do not.
    retry: 2,
  });
  const walletChainId = useWalletStore((s) => s.chainId);

  const registry = useMemo(() => registryQuery.data ?? [], [registryQuery.data]);
  const active = useMemo(
    () => (walletChainId === undefined ? undefined : findChain(registry, BigInt(walletChainId))),
    [registry, walletChainId],
  );

  const value = useMemo(() => ({ registry, active }), [registry, active]);

  // Gated on the registry, not on the wallet: without it nothing can tell a
  // supported chain from an unsupported one, so rendering the app would mean
  // guessing.
  if (registryQuery.isPending) return <ChainNotice>loading chains…</ChainNotice>;
  // Unreachable and empty are different facts and used to be reported as the
  // same one: `loadChainRegistry` swallowed its error and resolved `[]`, so a
  // 502 told the user "the registry is empty" and left them nothing to do but
  // reload the page by hand.
  if (registryQuery.error) {
    return (
      <ChainNotice tone="err" onRetry={() => void registryQuery.refetch()}>
        Could not reach the relayer to find out which networks are available.{" "}
        {registryQuery.error.message}
      </ChainNotice>
    );
  }
  if (registry.length === 0) {
    return (
      <ChainNotice tone="err" onRetry={() => void registryQuery.refetch()}>
        The relayer is not serving any network this app can use.
      </ChainNotice>
    );
  }
  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
}

/// Stands in for the entire app while the registry is unavailable, so it gets
/// enough layout not to read as a rendering failure.
function ChainNotice({
  children,
  tone,
  onRetry,
}: {
  children: ReactNode;
  tone?: "err";
  onRetry?: () => void;
}) {
  return (
    <div className="main">
      <div className={tone === "err" ? "err" : "muted txt-sm"}>{children}</div>
      {onRetry ? (
        <button type="button" className="btn mt-3" onClick={onRetry}>
          try again
        </button>
      ) : null}
    </div>
  );
}

function useChainContext(): ChainContextValue {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("chain hooks used outside ChainProvider");
  return ctx;
}

/// The chains this deployment serves. Always available below the provider,
/// including before a wallet connects.
export function useChainRegistry(): ChainEntry[] {
  return useChainContext().registry;
}

/// The active chain where one is not guaranteed — the wallet layer, which
/// renders before a wallet is connected and while it sits on an unsupported
/// network.
export function useActiveChainOrUndefined(): ChainEntry | undefined {
  return useChainContext().active;
}

/// The active chain, for everything rendered behind the `ready` gate in
/// `HomeLayout`.
///
/// Throws rather than returning `undefined`: reaching this without a supported
/// connected chain means the gate was bypassed, and every caller would
/// otherwise need a branch for a state that cannot legitimately occur there.
export function useActiveChain(): ChainEntry {
  const active = useActiveChainOrUndefined();
  if (!active) {
    throw new Error("useActiveChain requires a connected wallet on a supported chain");
  }
  return active;
}
