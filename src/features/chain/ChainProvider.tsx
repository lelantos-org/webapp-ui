// The active chain comes from the wallet's network, or from the registry for app-sourced kinds (passkey).

import { type ReactNode, useMemo } from "react";
import { findChain } from "@/config/chains";
import { useWalletKinds } from "@/features/wallet-kinds";
import { ChainContext, type ChainRegistryState } from "./context";
import { useChainRegistryQuery } from "./use-chain-registry-query";

export function ChainProvider({ children }: { children: ReactNode }) {
  const { active: activeKind, snapshots } = useWalletKinds();
  // Fetched from the moment a connection starts, so the registry is not waited on after it lands.
  const connecting = snapshots.some((s) => s.snapshot.connecting);
  const registryQuery = useChainRegistryQuery(activeKind !== undefined || connecting);
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
