// React context wiring for the SDK wallet.

import { type ReactNode, useCallback, useMemo } from "react";
import { closeDepositStreams } from "@/features/relayer/deposit-stream";
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

  const status = deriveWalletStatus({
    conn,
    wallet,
    deriveError,
    hasCachedKey,
  });
  const error = deriveError ?? conn.connectError;

  const disconnect = useCallback(() => {
    if (conn.address) clearCachedNsk(conn.address);
    // The relayer stream is an open SSE connection held for the wallet's
    // lifetime; drop it rather than leaving it running for a wallet that is
    // no longer connected.
    closeDepositStreams();
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
      connect: conn.connect,
      disconnect,
      switchChain: conn.switchChain,
      refresh,
    }),
    [status, error, wallet, conn.address, conn.connect, conn.switchChain, disconnect, refresh],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
