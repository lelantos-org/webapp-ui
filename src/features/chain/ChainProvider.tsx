// Which chain the app is on, decided by the connected wallet.
//
// There is no in-app chain selection. An app-level setting would be a second
// source of truth: the app could claim one chain while the wallet sat on
// another, with the disagreement surfacing only as a switch prompt at submit.
// Reading the wallet's network keeps the two in agreement.
// `ChainSwitchButtons` initiates a switch from inside the app, but it moves the
// wallet rather than a separate app-level setting.
//
// A chain the registry does not describe leaves `active` undefined. That is a
// distinct state — the wallet is on a network this deployment cannot serve —
// and is surfaced as the `unsupported-chain` wallet status rather than defaulted
// away.

import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import {
  type ChainEntry,
  findChain,
  loadChainRegistry,
  readCachedChainRegistry,
} from "@/config/chains";
import { useWalletStore } from "@/features/eip1193";

const chainRegistryKey = ["chain-registry"] as const;

interface ChainContextValue {
  registry: ChainEntry[];
  /// The wallet's network, when this deployment serves it. `undefined` when no
  /// wallet is connected, or when it is on a chain outside the registry.
  active: ChainEntry | undefined;
}

const ChainContext = createContext<ChainContextValue | undefined>(undefined);

export function ChainProvider({ children }: { children: ReactNode }) {
  // Read once per mount rather than per render: this touches localStorage and
  // runs a zod parse, and its result cannot change while the tab is open.
  const [cached] = useState(readCachedChainRegistry);

  const registryQuery = useQuery({
    queryKey: chainRegistryKey,
    queryFn: loadChainRegistry,
    // `placeholderData` rather than `initialData`. Placeholder data is never
    // treated as cached, so the fetch still runs once on mount and the infinite
    // `staleTime` applies only to the relayer's response; `initialData` would
    // combine with that staleTime to pin a potentially months-old registry for
    // the life of the tab.
    //
    // With anything cached, `isPending` is false from the first render, so the
    // app paints immediately rather than holding a spinner for a full round-trip.
    placeholderData: cached,
    // The set of deployed chains does not change under a running tab, and every
    // wallet-facing read depends on it, so refetching adds no value.
    staleTime: Number.POSITIVE_INFINITY,
    // The whole app is gated on this, so a single failed attempt should not
    // require a page reload; the retry button below covers the remaining cases.
    retry: 2,
  });
  const walletChainId = useWalletStore((s) => s.chainId);

  const registry = useMemo(() => registryQuery.data ?? [], [registryQuery.data]);
  const active = useMemo(
    () => (walletChainId === undefined ? undefined : findChain(registry, BigInt(walletChainId))),
    [registry, walletChainId],
  );

  const value = useMemo(() => ({ registry, active }), [registry, active]);

  // Gated on the registry rather than the wallet: without it nothing can
  // distinguish a supported chain from an unsupported one. With a cached
  // registry `isPending` is already false, so this spinner appears only on a
  // browser that has never reached the relayer.
  if (registryQuery.isPending) return <ChainNotice>loading chains…</ChainNotice>;

  // The two failure notices are gated on having no registry at all rather than
  // on the query's status. A revalidation failing behind a cached registry must
  // not replace a working app with an error screen: the cached chains remain
  // correct, and a relayer that is down surfaces in `HealthIndicator` and again
  // at the first action needing it.
  if (registry.length === 0) {
    // Unreachable and empty are distinct: `loadChainRegistry` throws for the
    // former and resolves `[]` for the latter, so a 502 is not reported as an
    // empty registry and the retry below has something to act on.
    if (registryQuery.error) {
      return (
        <ChainNotice tone="err" onRetry={() => void registryQuery.refetch()}>
          Could not reach the relayer to find out which networks are available.{" "}
          {registryQuery.error.message}
        </ChainNotice>
      );
    }
    return (
      <ChainNotice tone="err" onRetry={() => void registryQuery.refetch()}>
        The relayer is not serving any network this app can use.
      </ChainNotice>
    );
  }
  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
}

/// Stands in for the entire app while the registry is unavailable, with enough
/// layout not to read as a rendering failure.
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
        <button type="button" className="btn mt-8" onClick={onRetry}>
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

/// The active chain where one is not guaranteed: the wallet layer, which renders
/// before a wallet is connected and while it sits on an unsupported network.
export function useActiveChainOrUndefined(): ChainEntry | undefined {
  return useChainContext().active;
}

/// The active chain, for everything rendered behind the `ready` gate in
/// `HomeLayout`.
///
/// Throws rather than returning `undefined`: reaching this without a supported
/// connected chain means the gate was bypassed, and every caller would otherwise
/// need a branch for a state that cannot occur there.
export function useActiveChain(): ChainEntry {
  const active = useActiveChainOrUndefined();
  if (!active) {
    throw new Error("useActiveChain requires a connected wallet on a supported chain");
  }
  return active;
}
