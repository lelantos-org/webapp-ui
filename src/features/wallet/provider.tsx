// React context wiring for the SDK wallet.

import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { closeDepositStreams } from "@/features/relayer";
import { toastInfo } from "@/shared/lib/toast";
import { clearAllCachedNsk, clearCachedNsk } from "./nsk-session-cache";
import { disposeProverWorker } from "./prover/prover-worker";
import { releaseScanner } from "./scanner";
import type { WalletContextValue } from "./types";
import { useBuildWallet } from "./use-build-wallet";
import { useConnectFlow } from "./use-connect-flow";
import { useConnection } from "./use-connection";
import { WalletContext } from "./use-wallet";
import { WalletPicker } from "./WalletPicker";
import { deriveWalletStatus } from "./wallet-status";

export function WalletProvider({ children }: { children: ReactNode }) {
  const conn = useConnection();
  const { wallet, error: deriveError, hasCachedKey } = useBuildWallet(conn);
  // The picker lives here rather than at each connect button, so `connect` means
  // "start the flow" and no picker state is threaded through the call sites.
  const flow = useConnectFlow();

  const status = deriveWalletStatus({
    conn,
    wallet,
    deriveError,
    hasCachedKey,
  });
  const error = deriveError ?? conn.connectError;

  // Drop the outgoing account's nsk when the wallet rotates accounts.
  //
  // The cache is keyed by address and lives for the tab's life, so without this a
  // session touching several accounts accumulates one raw spending key per
  // account in `sessionStorage`, readable by any script on the origin. Switching
  // back re-prompts for a signature.
  const prevAddress = useRef<string | undefined>(conn.address);
  useEffect(() => {
    const prev = prevAddress.current;
    prevAddress.current = conn.address;
    if (prev && prev !== conn.address) clearCachedNsk(prev);
  }, [conn.address]);

  const disconnect = useCallback(() => {
    // Every entry, not only the connected address: `clearCachedNsk(address)`
    // would leave the keys of any account used earlier in the session in place.
    clearAllCachedNsk();
    // The relayer stream is an open SSE connection held for the wallet's
    // lifetime, so it is dropped rather than left running after a disconnect.
    closeDepositStreams();
    // Same for the two worker pools, which together hold the ~49 MB zkey, the
    // circuit wasm, a rayon pool and one jubjub wasm instance per scanner worker.
    // None of it is reachable from a disconnected wallet, and any later proof
    // follows a fresh connect.
    disposeProverWorker();
    releaseScanner(wallet);
    conn.disconnect();
    toastInfo("disconnected");
  }, [conn.disconnect, wallet]);

  const refresh = useCallback(async () => {
    if (wallet) await wallet.sync({ limit: 500 });
  }, [wallet]);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      error,
      wallet,
      ethAddress: conn.address,
      connect: flow.begin,
      disconnect,
      switchChain: conn.switchChain,
      refresh,
    }),
    [status, error, wallet, conn.address, flow.begin, conn.switchChain, disconnect, refresh],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      {flow.choices ? (
        <WalletPicker wallets={flow.choices} onChoose={flow.choose} onCancel={flow.cancel} />
      ) : null}
    </WalletContext.Provider>
  );
}
