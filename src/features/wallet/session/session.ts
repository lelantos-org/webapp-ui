// The wallet session, independent of which kind of wallet backs it.
//
// The per-kind facts live in `features/wallet-kinds`; this is the seam that
// reads them. It answers "who is connected, on what chain, and what can they
// do" without naming a kind: each per-kind question is a field on the active
// adapter, never a `kind === "passkey"` branch. Nothing here may assume an EOA:
// a passkey holds no EVM account and cannot be asked to switch networks.

import { useCallback, useMemo } from "react";
import {
  type ChainRegistryState,
  useActiveChainOrUndefined,
  useChainRegistryState,
} from "@/features/chain";
import { type ChainLayerSpec, useWalletKinds, type WalletKind } from "@/features/wallet-kinds";

export interface Session {
  /// The wallet kind backing this session; undefined while disconnected.
  kind?: WalletKind | undefined;
  /// Present only for kinds that hold a public Ethereum account. A passkey has
  /// none, so every consumer of this must tolerate its absence.
  ethAddress?: `0x${string}` | undefined;
  /// Stable identity for this account, whatever the kind. Keys the nsk cache,
  /// the note/tree/nullifier stores and the build pool.
  accountKey?: string | undefined;
  /// The active chain is one this deployment serves. Meaningless until
  /// `registry` is `ready`: with no registry, no chain is known to be served.
  chainSupported: boolean;
  /// The chain registry, fetched only once connected.
  registry: ChainRegistryState;
  /// Present only when fully ready: connected, with an account and a chain.
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

  // Keyed on the adapter, not `active`: `useWalletKinds` rebuilds its wrappers
  // every render, while the adapter is a module constant that changes only with
  // the kind. Keying on `active` handed consumers a fresh callback every render.
  const adapter = active?.adapter;
  const disconnect = useCallback(() => adapter?.disconnect(), [adapter]);

  // A fresh object on every render aborts `useBuildWallet`'s in-flight build,
  // leaving the UI on "resuming…". Each adapter memoises its own snapshot, so
  // this passes a stable `layer` through; it only gates it on having a chain to
  // build against.
  const layer = useMemo<ChainLayerSpec | undefined>(
    () => (activeChain ? active?.snapshot.layer : undefined),
    [active, activeChain],
  );

  // A connect in flight on any kind, and the error from whichever reported one:
  // the picker can start a passkey enrolment while no wallet is attached, so
  // neither is a property of the active session.
  const pending = snapshots.find((s) => s.snapshot.connecting);
  const failed = snapshots.find((s) => s.snapshot.error !== undefined);

  return {
    kind: active?.adapter.kind,
    ethAddress: active?.snapshot.ethAddress,
    accountKey: active?.snapshot.accountKey,
    // A kind that selects its own chain from the registry can never be on a
    // network this deployment does not serve.
    chainSupported: active?.adapter.chainSource === "app" || activeChain !== undefined,
    registry,
    layer,
    isConnected: !!active,
    isConnecting: !!pending,
    connectError: failed?.snapshot.error,
    disconnect,
  };
}
