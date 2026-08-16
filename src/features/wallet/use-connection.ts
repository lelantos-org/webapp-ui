// Thin facade over `walletStore`; all real logic lives in `features/eip1193`.

import { useCallback, useMemo } from "react";
import type { ChainEntry } from "@/config/chains";
import { useActiveChainOrUndefined } from "@/features/chain/ChainProvider";
import type { Eip1193Provider } from "@/features/eip1193/store";
import { walletStore } from "@/features/eip1193/store";
import { useWalletStore } from "@/features/eip1193/use-store";
import { useSwitchChain } from "@/features/eip1193/use-switch-chain";

/// Everything the SDK signer adapter needs in one bag.
export interface ConnectionBundle {
  provider: Eip1193Provider;
  address: `0x${string}`;
  chain: { id: number; name: string };
}

export interface Connection {
  address?: `0x${string}`;
  /// The wallet is on a chain this deployment serves. Not "matches the app":
  /// the wallet defines the chain, so the only question is whether we know it.
  chainSupported: boolean;
  /// Present only when fully ready (connected + has provider + address + chain).
  bundle?: ConnectionBundle;
  isConnected: boolean;
  isConnecting: boolean;
  connectError?: string;
  connect(): void;
  disconnect(): void;
  switchChain(target: ChainEntry): void;
}

export function useConnection(): Connection {
  // The wallet's own network decides the chain, so there is no target to
  // compare against — only whether this deployment serves where it already is.
  const activeChain = useActiveChainOrUndefined();
  const status = useWalletStore((s) => s.status);
  const address = useWalletStore((s) => s.address);
  const chainId = useWalletStore((s) => s.chainId);
  const provider = useWalletStore((s) => s.provider);
  const error = useWalletStore((s) => s.error);

  const connect = useCallback(() => {
    void walletStore.connect();
  }, []);

  const disconnect = useCallback(() => walletStore.disconnect(), []);

  const switchChain = useSwitchChain();

  const isConnected = status === "connected" && !!address;
  const chainSupported = activeChain !== undefined;
  // A fresh bundle object every render aborts `useBuildWallet`'s in-flight
  // build — symptom: UI stuck on "resuming…" forever.
  const bundle = useMemo<ConnectionBundle | undefined>(() => {
    if (!isConnected || !provider || !address || chainId === undefined) return undefined;
    if (!activeChain) return undefined;
    return { provider, address, chain: { id: chainId, name: activeChain.chainName } };
  }, [isConnected, provider, address, chainId, activeChain]);

  return {
    address,
    chainSupported,
    bundle,
    isConnected,
    isConnecting: status === "connecting",
    connectError: status === "error" ? error : undefined,
    connect,
    disconnect,
    switchChain,
  };
}
