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

import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";
import { type ChainEntry, findChain, txExplorerUrl } from "@/config/chains";
import { useWalletKinds } from "@/features/wallet-kinds";
import { ChainRegistryGate } from "./ChainRegistryGate";
import { useChainRegistryQuery } from "./use-chain-registry-query";

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
