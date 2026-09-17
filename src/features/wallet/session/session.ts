import { useCallback, useMemo } from "react";
import {
  type ChainRegistryState,
  useActiveChainOrUndefined,
  useChainRegistryState,
} from "@/features/chain";
import { type ChainLayerSpec, useWalletKinds, type WalletKind } from "@/features/wallet-kinds";

export interface Session {
  /// Undefined while disconnected.
  kind?: WalletKind | undefined;
  /// Absent for kinds without a public Ethereum account (passkey).
  ethAddress?: `0x${string}` | undefined;
  /// Stable per-account identity; keys the nsk cache, stores and build pool.
  accountKey?: string | undefined;
  /// Meaningless until `registry` is `ready`.
  chainSupported: boolean;
  registry: ChainRegistryState;
  /// Present only when connected with an account and a chain.
  layer?: ChainLayerSpec | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  connectError?: string | undefined;
  disconnect(): void;
}

export function useSession(): Session {
  const activeChain = useActiveChainOrUndefined();
  const registry = useChainRegistryState();
  const { active, snapshots } = useWalletKinds();

  // Keyed on the adapter (a module constant), not the per-render `active` wrapper.
  const adapter = active?.adapter;
  const disconnect = useCallback(() => adapter?.disconnect(), [adapter]);

  // Must stay referentially stable: a fresh object aborts `useBuildWallet`'s in-flight build.
  const layer = useMemo<ChainLayerSpec | undefined>(
    () => (activeChain ? active?.snapshot.layer : undefined),
    [active, activeChain],
  );

  const pending = snapshots.find((s) => s.snapshot.connecting);
  const failed = snapshots.find((s) => s.snapshot.error !== undefined);

  return {
    kind: active?.adapter.kind,
    ethAddress: active?.snapshot.ethAddress,
    accountKey: active?.snapshot.accountKey,
    chainSupported: active?.adapter.chainSource === "app" || activeChain !== undefined,
    registry,
    layer,
    isConnected: !!active,
    isConnecting: !!pending,
    connectError: failed?.snapshot.error,
    disconnect,
  };
}
