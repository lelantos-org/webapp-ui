// Thin facade over `walletStore`; all real logic lives in `wallet-store.ts`.

import { useCallback, useMemo } from "react";
import { env } from "@/config/env";
import type { Eip1193Provider } from "@/features/wallet/wallet-store";
import { useWalletStore } from "@/features/wallet/use-wallet-store";
import { walletStore } from "@/features/wallet/wallet-store";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";

const log = createLogger("wallet:connection");

/// Everything the SDK signer adapter needs in one bag.
export interface ConnectionBundle {
  provider: Eip1193Provider;
  address: `0x${string}`;
  chain: { id: number; name: string };
}

export interface Connection {
  address?: `0x${string}`;
  chainOk: boolean;
  /// Present only when fully ready (connected + has provider + address + chain).
  bundle?: ConnectionBundle;
  isConnected: boolean;
  isConnecting: boolean;
  connectError?: string;
  connect(): void;
  disconnect(): void;
  switchChain(): void;
}

const targetChainId = Number(env.chainId);

export function useConnection(): Connection {
  const status = useWalletStore((s) => s.status);
  const address = useWalletStore((s) => s.address);
  const chainId = useWalletStore((s) => s.chainId);
  const provider = useWalletStore((s) => s.provider);
  const error = useWalletStore((s) => s.error);

  const connect = useCallback(() => {
    void walletStore.connect();
  }, []);

  const disconnect = useCallback(() => walletStore.disconnect(), []);

  const switchChain = useCallback(() => {
    log.debug("switchChain requested", { to: targetChainId, connected: status === "connected" });
    void walletStore.switchChain(targetChainId).catch((err) => {
      log.warn("switchChain failed", err);
      toastError("network switch failed", err);
    });
  }, [status]);

  const isConnected = status === "connected" && !!address;
  const chainOk = chainId === targetChainId;
  // A fresh bundle object every render aborts `useBuildWallet`'s in-flight
  // build — symptom: UI stuck on "resuming…" forever.
  const bundle = useMemo<ConnectionBundle | undefined>(() => {
    if (!isConnected || !provider || !address || chainId === undefined) return undefined;
    return { provider, address, chain: { id: chainId, name: env.chainName } };
  }, [isConnected, provider, address, chainId]);

  return {
    address,
    chainOk,
    bundle,
    isConnected,
    isConnecting: status === "connecting",
    connectError: status === "error" ? error : undefined,
    connect,
    disconnect,
    switchChain,
  };
}
