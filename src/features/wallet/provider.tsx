// React context wiring for the SDK wallet.

import { type ReactNode, useCallback, useMemo } from "react";
import { env } from "@/config/env";
import { clearCachedNsk } from "@/features/wallet/nsk-session-cache";
import type { WalletContextValue } from "@/features/wallet/types";
import { useBuildWallet } from "@/features/wallet/use-build-wallet";
import { useConnection } from "@/features/wallet/use-connection";
import { WalletContext } from "@/features/wallet/use-wallet";
import { deriveWalletStatus } from "@/features/wallet/wallet-status";
import { toastInfo } from "@/shared/lib/toast";

export function WalletProvider({ children }: { children: ReactNode }) {
  const conn = useConnection();
  const { wallet, error: deriveError, hasCachedKey } = useBuildWallet(conn);

  const status = deriveWalletStatus({ conn, wallet, deriveError, hasCachedKey });
  const error = deriveError ?? conn.connectError;

  const disconnect = useCallback(() => {
    if (conn.address) clearCachedNsk(env.chainId, conn.address);
    conn.disconnect();
    toastInfo("disconnected");
  }, [conn.disconnect, conn.address]);

  const refresh = useCallback(async () => {
    if (wallet) await wallet.sync({ limit: 500 });
  }, [wallet]);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      error,
      wallet,
      ethAddress: conn.address,
      chainOk: conn.chainOk,
      connect: conn.connect,
      disconnect,
      switchChain: conn.switchChain,
      refresh,
    }),
    [
      status,
      error,
      wallet,
      conn.address,
      conn.chainOk,
      conn.connect,
      conn.switchChain,
      disconnect,
      refresh,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
