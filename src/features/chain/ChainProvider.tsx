// Which chain the app is on, decided by the connected wallet where there is one
// to ask.
//
// For an injected wallet there is no in-app chain selection. An app-level
// setting would be a second source of truth: the app could claim one chain
// while the wallet sat on another, with the disagreement surfacing only as a
// switch prompt at submit. Reading the wallet's network keeps the two in
// agreement. `ChainSwitchButtons` initiates a switch from inside the app, but
// it moves the wallet rather than a separate app-level setting.
//
// A kind with no network to read — a passkey — reports `chainSource: "app"`
// instead, and the app selects from the registry on its behalf. Which kind is
// live, and which of the two it is, are both answered by `useWalletKinds`, so
// there is no per-kind branch here.
//
// A chain the registry does not describe leaves `active` undefined. That is a
// distinct state — the wallet is on a network this deployment cannot serve —
// and is surfaced as the `unsupported-chain` wallet status rather than defaulted
// away.

import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import {
  type ChainEntry,
  findChain,
  loadChainRegistry,
  readCachedChainRegistry,
  txExplorerUrl,
} from "@/config/chains";
import { useWalletKinds } from "@/features/wallet-kinds";
import { queryKeys } from "@/shared/query/keys";

interface ChainContextValue {
  registry: ChainEntry[];
  /// The active chain: the wallet's network when this deployment serves it, or
  /// the passkey session's selection. `undefined` when nothing is connected, or
  /// when an injected wallet is on a chain outside the registry.
  active: ChainEntry | undefined;
}

const ChainContext = createContext<ChainContextValue | undefined>(undefined);

export function ChainProvider({ children }: { children: ReactNode }) {
  const registryQuery = useChainRegistryQuery();
  const { active: activeKind } = useWalletKinds();
  const chainSource = activeKind?.adapter.chainSource;
  const reportedChainId = activeKind?.snapshot.chainId;

  const registry = useMemo(() => registryQuery.data ?? [], [registryQuery.data]);
  const active = useMemo(() => {
    if (!chainSource) return undefined;
    const named = reportedChainId === undefined ? undefined : findChain(registry, reportedChainId);
    // A wallet-sourced chain outside the registry stays undefined — that is the
    // `unsupported-chain` state, and defaulting it away would claim a network
    // the wallet is not on. An app-sourced one falls back to the first chain
    // served, since every option is one this deployment serves.
    return chainSource === "wallet" ? named : (named ?? registry[0]);
  }, [registry, chainSource, reportedChainId]);

  const value = useMemo(() => ({ registry, active }), [registry, active]);

  return (
    <ChainRegistryGate query={registryQuery} registry={registry}>
      <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
    </ChainRegistryGate>
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
/// `Home` and `ActionScreen`.
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

/// Builds explorer links for the active chain.
///
/// The component-side counterpart to passing an explorer base explicitly:
/// non-React callers (the lifecycle tracker) receive the chain they submitted
/// on, and components read the one currently selected.
export function useTxExplorerUrl(): (txHash: string) => string | undefined {
  const explorerUrl = useActiveChainOrUndefined()?.explorerUrl;
  return useCallback((txHash: string) => txExplorerUrl(explorerUrl, txHash), [explorerUrl]);
}

/// The chain registry as a query: fetched once per tab, painted from the cached
/// copy meanwhile.
function useChainRegistryQuery(): UseQueryResult<ChainEntry[]> {
  // Read once per mount rather than per render: this touches localStorage and
  // runs a zod parse, and its result cannot change while the tab is open.
  const [cached] = useState(readCachedChainRegistry);

  return useQuery({
    queryKey: queryKeys.chainRegistry(),
    queryFn: loadChainRegistry,
    // `placeholderData` rather than `initialData`. Placeholder data is never
    // treated as cached, so the fetch still runs once on mount and the infinite
    // `staleTime` applies only to the relayer's response; `initialData` would
    // combine with that staleTime to pin a potentially months-old registry for
    // the life of the tab.
    //
    // With anything cached, `isPending` is false from the first render, so the
    // app paints immediately rather than holding a spinner for a full round-trip.
    // Nothing cached means no placeholder at all, so the key is left out.
    ...(cached ? { placeholderData: cached } : {}),
    // The set of deployed chains does not change under a running tab, but the
    // payload is more than identity: each yield asset carries `index` and the
    // relayer's rate estimate, which it re-measures on its own schedule. An
    // infinite `staleTime` would pin both at whatever they were when the tab
    // opened, so a rate labelled "over the last 7 days" could be a week old
    // itself. Long enough that a herd of tabs does not poll the registry, short
    // enough that a figure on screen is one the relayer still stands behind.
    staleTime: 10 * 60 * 1000,
    // The whole app is gated on this, so a single failed attempt should not
    // require a page reload; the retry button below covers the remaining cases.
    retry: 2,
  });
}

/// What the app shows in place of itself while there is no chain registry to
/// run on.
function ChainRegistryGate({
  query,
  registry,
  children,
}: {
  query: UseQueryResult<ChainEntry[]>;
  /// The registry as the provider reads it: the query's data, or empty.
  registry: ChainEntry[];
  children: ReactNode;
}) {
  // Gated on the registry rather than the wallet: without it nothing can
  // distinguish a supported chain from an unsupported one. With a cached
  // registry `isPending` is already false, so this spinner appears only on a
  // browser that has never reached the relayer.
  if (query.isPending) return <ChainNotice>loading chains…</ChainNotice>;

  // The two failure notices are gated on having no registry at all rather than
  // on the query's status. A revalidation failing behind a cached registry must
  // not replace a working app with an error screen: the cached chains remain
  // correct, and a relayer that is down surfaces in `HealthIndicator` and again
  // at the first action needing it.
  if (registry.length === 0) {
    // Unreachable and empty are distinct: `loadChainRegistry` throws for the
    // former and resolves `[]` for the latter, so a 502 is not reported as an
    // empty registry and the retry below has something to act on.
    if (query.error) {
      return (
        <ChainNotice tone="err" onRetry={() => void query.refetch()}>
          Could not reach the relayer to find out which networks are available.{" "}
          {query.error.message}
        </ChainNotice>
      );
    }
    return (
      <ChainNotice tone="err" onRetry={() => void query.refetch()}>
        The relayer is not serving any network this app can use.
      </ChainNotice>
    );
  }
  return <>{children}</>;
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
