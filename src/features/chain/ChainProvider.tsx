// The active chain comes from the wallet's network, or from the registry for app-sourced kinds (passkey).

import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";
import { type ChainEntry, findChain, txExplorerUrl } from "@/config/chains";
import { useWalletKinds } from "@/features/wallet-kinds";
import { useChainRegistryQuery } from "./use-chain-registry-query";

/// Registry fetch state; `failed` only when no registry (not even a cached one) is available.
export type ChainRegistryState =
  | { status: "idle" | "loading" | "ready" }
  | { status: "failed"; message: string; retry(): void };

interface ChainContextValue {
  registry: ChainEntry[];
  /// `undefined` when disconnected or when a wallet is on a chain outside the registry.
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
    // Never default a wallet-sourced chain: undefined is the `unsupported-chain` state.
    return chainSource === "wallet" ? named : (named ?? registry[0]);
  }, [registry, chainSource, reportedChainId]);

  const connected = activeKind !== undefined;
  const { isPending, isFetching, error, refetch } = registryQuery;
  const registryState = useMemo<ChainRegistryState>(() => {
    if (!connected) return { status: "idle" };
    if (registry.length > 0) return { status: "ready" };
    if (isFetching || (isPending && !error)) return { status: "loading" };
    const retry = () => void refetch();
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

/// The chains this deployment serves; before connecting, only the cached copy (possibly empty).
export function useChainRegistry(): ChainEntry[] {
  return useChainContext().registry;
}

/// Where the registry fetch stands; see `ChainRegistryState`.
export function useChainRegistryState(): ChainRegistryState {
  return useChainContext().registryState;
}

/// The active chain, or `undefined` when disconnected or on an unsupported network.
export function useActiveChainOrUndefined(): ChainEntry | undefined {
  return useChainContext().active;
}

/// The active chain behind the `ready` gate; throws if there is none.
export function useActiveChain(): ChainEntry {
  const active = useActiveChainOrUndefined();
  if (!active) {
    throw new Error("useActiveChain requires a connected wallet on a supported chain");
  }
  return active;
}

/// Builds explorer links for the active chain.
export function useTxExplorerUrl(): (txHash: string) => string | undefined {
  const explorerUrl = useActiveChainOrUndefined()?.explorerUrl;
  return useCallback((txHash: string) => txExplorerUrl(explorerUrl, txHash), [explorerUrl]);
}
