import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { useActiveChainOrUndefined } from "@/features/chain";
import { clearAllCachedNsk, clearCachedNsk, eip1193Store } from "@/features/wallet-kinds";
import { toastInfo } from "@/shared/lib/toast";
import { useBuildWallet } from "../build/use-build-wallet";
import { useConnectFlow } from "../connect/use-connect-flow";
import { WalletPicker } from "../connect/WalletPicker";
import { disposeProverWorker } from "../prover/prover-worker";
import { releaseScanner } from "../sync/scanner";
import { deriveCapabilities } from "./capabilities";
import { WalletContext, type WalletContextValue, WalletInstanceContext } from "./context";
import { useSession } from "./session";
import { deriveWalletStatus } from "./wallet-status";

export function WalletProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const { wallet, error: deriveError, hasCachedKey } = useBuildWallet(session);
  const flow = useConnectFlow();

  const status = deriveWalletStatus({
    session,
    wallet,
    deriveError,
    hasCachedKey,
  });
  const registryFailure = session.registry.status === "failed" ? session.registry : undefined;
  const error = registryFailure?.message ?? deriveError ?? session.connectError;
  // After a registry failure, "try again" repeats the fetch.
  const connect = registryFailure?.retry ?? flow.begin;

  const activeChain = useActiveChainOrUndefined();
  const capabilities = useMemo(
    () =>
      deriveCapabilities(wallet, session.kind, {
        ethAddress: session.ethAddress,
        chain: activeChain,
      }),
    [wallet, session.kind, session.ethAddress, activeChain],
  );

  // Drop the outgoing account's nsk on account rotation, so raw spending keys do not pile up in sessionStorage.
  const prevAccount = useRef<string | undefined>(session.accountKey);
  useEffect(() => {
    const prev = prevAccount.current;
    prevAccount.current = session.accountKey;
    if (prev && prev !== session.accountKey) clearCachedNsk(prev);
  }, [session.accountKey]);

  const disconnect = useCallback(() => {
    // Every entry, not only the current account's: earlier accounts' keys must go too.
    clearAllCachedNsk();
    disposeProverWorker();
    releaseScanner(wallet);
    session.disconnect();
    toastInfo("disconnected");
  }, [session.disconnect, wallet]);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      error,
      wallet,
      kind: session.kind,
      ethAddress: session.ethAddress,
      capabilities,
      connect,
      disconnect,
    }),
    [status, error, wallet, session.kind, session.ethAddress, capabilities, connect, disconnect],
  );

  const instance = useMemo(() => ({ wallet }), [wallet]);

  // Boot the wallet store once: EIP-6963 discovery and a silent reconnect.
  useEffect(() => {
    eip1193Store.startDiscovery();
    void eip1193Store.resumeFromStorage();
  }, []);

  return (
    <WalletContext.Provider value={value}>
      <WalletInstanceContext.Provider value={instance}>
        {children}
        {flow.choices ? (
          <WalletPicker wallets={flow.choices} onChoose={flow.choose} onCancel={flow.cancel} />
        ) : null}
      </WalletInstanceContext.Provider>
    </WalletContext.Provider>
  );
}
