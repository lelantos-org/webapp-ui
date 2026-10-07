import { createContext, useCallback, useContext } from "react";
import { type ChainEntry, txExplorerUrl } from "@/config/chains";

/// Registry fetch state; `failed` only when no registry (not even a cached one) is available.
export type ChainRegistryState =
  | { status: "idle" | "loading" | "ready" }
  | { status: "failed"; message: string; retry(): void };

export interface ChainContextValue {
  registry: ChainEntry[];
  /// `undefined` when disconnected or when a wallet is on a chain outside the registry.
  active: ChainEntry | undefined;
  registryState: ChainRegistryState;
}

export const ChainContext = createContext<ChainContextValue | undefined>(undefined);

function useChainContext(): ChainContextValue {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("chain hooks used outside ChainProvider");
  return ctx;
}

/// The chains this deployment serves; before connecting, only the cached copy (possibly empty).
export function useChainRegistry(): ChainEntry[] {
  return useChainContext().registry;
}

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

export function useTxExplorerUrl(): (txHash: string) => string | undefined {
  const explorerUrl = useActiveChainOrUndefined()?.explorerUrl;
  return useCallback((txHash: string) => txExplorerUrl(explorerUrl, txHash), [explorerUrl]);
}
