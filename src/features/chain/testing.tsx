// Test-only entry: imported by tests and `src/test`, never by the app.

import { type ReactNode, useMemo } from "react";
import type { ChainEntry } from "@/config/chains";
import { ChainContext, type ChainContextValue, type ChainRegistryState } from "./context";

interface ChainTestProviderProps {
  /// The active chain. `undefined` reads as disconnected, or on a network outside the registry.
  chain: ChainEntry | undefined;
  /// Default: the active chain alone.
  registry?: ChainEntry[] | undefined;
  /// Default: `ready` with a registry, `idle` without one.
  registryState?: ChainRegistryState | undefined;
  children: ReactNode;
}

/// The chain context a test dictates, in place of `ChainProvider`. Pass values with a stable
/// identity: the hooks hand them straight to their callers' memo and effect deps.
export function ChainTestProvider({
  chain,
  registry,
  registryState,
  children,
}: ChainTestProviderProps) {
  const value = useMemo<ChainContextValue>(() => {
    const all = registry ?? (chain ? [chain] : []);
    return {
      registry: all,
      active: chain,
      registryState: registryState ?? { status: all.length > 0 ? "ready" : "idle" },
    };
  }, [chain, registry, registryState]);
  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
}
