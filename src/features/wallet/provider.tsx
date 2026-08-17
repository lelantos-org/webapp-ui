// React context wiring for the SDK wallet.

import { type ReactNode, useCallback, useMemo } from "react";
import { closeDepositStreams } from "@/features/relayer/deposit-stream";
import { clearCachedNsk } from "@/features/wallet/nsk-session-cache";
import { disposeProverWorker } from "@/features/wallet/prover/proverWorker";
import { releaseScanner } from "@/features/wallet/scanner";
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
    // Same for the two worker pools, which between them hold the ~49 MB zkey,
    // the circuit wasm, a rayon pool and one jubjub wasm instance per scanner
    // worker. None of it is reachable from a disconnected wallet, and any
    // subsequent prove follows a fresh connect.
    disposeProverWorker();
    releaseScanner(wallet);
    conn.disconnect();
    toastInfo("disconnected");
  }, [conn.disconnect, conn.address, wallet]);

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
