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
//
// The registry itself is fetched only once a kind is connected: nothing talks to
// the backend before the user connects a wallet or a passkey. Its loading and
// failure are not a screen of their own either, since that would replace the
// Welcome card the connection happens on; they reach the user as wallet
// statuses (`loading-networks`, `error`) through `useChainRegistryState`.

import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";
import { type ChainEntry, findChain, txExplorerUrl } from "@/config/chains";
import { useWalletKinds } from "@/features/wallet-kinds";
import { useChainRegistryQuery } from "./use-chain-registry-query";

/// Where the registry stands for the session.
///
/// `idle` before a wallet connects (nothing is fetched, though a cached registry
/// may still be on hand). `failed` only when there is no registry at all: a
/// revalidation failing behind a cached one leaves the cached chains, which
/// remain correct, and a service that is down surfaces in `HealthIndicator` and
/// again at the first action needing it.
export type ChainRegistryState =
  | { status: "idle" | "loading" | "ready" }
  | { status: "failed"; message: string; retry(): void };

interface ChainContextValue {
  registry: ChainEntry[];
  /// The active chain: the wallet's network when this deployment serves it, or
  /// the passkey session's selection. `undefined` when nothing is connected, or
  /// when an injected wallet is on a chain outside the registry.
  active: ChainEntry | undefined;
  registryState: ChainRegistryState;
}

const ChainContext = createContext<ChainContextValue | undefined>(undefined);

export function ChainProvider({ children }: { children: ReactNode }) {
  const { active: activeKind } = useWalletKinds();
  const registryQuery = useChainRegistryQuery(activeKind !== undefined);
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

  const connected = activeKind !== undefined;
  const { isPending, isFetching, error, refetch } = registryQuery;
  const registryState = useMemo<ChainRegistryState>(() => {
    if (!connected) return { status: "idle" };
    if (registry.length > 0) return { status: "ready" };
    // `isPending` too: the render that enables the query can precede its fetch.
    if (isFetching || (isPending && !error)) return { status: "loading" };
    const retry = () => void refetch();
    // Unreachable and empty are distinct: `loadChainRegistry` throws for the
    // former and resolves `[]` for the latter, so a 502 is not reported as an
    // empty registry and the retry has something to act on.
    return error
      ? {
          status: "failed",
          message: `Could not reach the relayer to find out which networks are available. ${error.message}`,
          retry,
        }
      : {
          status: "failed",
          message: "The relayer is not serving any network this app can use.",
          retry,
        };
  }, [connected, registry.length, isPending, isFetching, error, refetch]);

  const value = useMemo(
    () => ({ registry, active, registryState }),
    [registry, active, registryState],
  );

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
}

function useChainContext(): ChainContextValue {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("chain hooks used outside ChainProvider");
  return ctx;
}

/// The chains this deployment serves. Before a wallet connects this is only the
/// copy cached by an earlier session, possibly empty: the registry is not
/// fetched until then.
export function useChainRegistry(): ChainEntry[] {
  return useChainContext().registry;
}

/// Where the registry fetch stands; see `ChainRegistryState`.
export function useChainRegistryState(): ChainRegistryState {
  return useChainContext().registryState;
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
