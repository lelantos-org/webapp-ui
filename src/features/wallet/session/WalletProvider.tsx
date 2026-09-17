// React context wiring for the SDK wallet: the session, the wallet built from
// it, the connect flow's picker, and the store's boot.
//
// The picker is mounted once here rather than at each connect button, so
// `connect` means "start the flow" and no picker state is threaded through the
// call sites.

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
  // Every "try again" is wired to `connect`. After a registry failure the wallet
  // is connected already, and what needs repeating is the fetch.
  const connect = registryFailure?.retry ?? flow.begin;

  // Derived once here rather than in each consumer, so no component
  // re-implements the rule and drifts from it.
  const activeChain = useActiveChainOrUndefined();
  const capabilities = useMemo(
    () =>
      deriveCapabilities(wallet, session.kind, {
        ethAddress: session.ethAddress,
        chain: activeChain,
      }),
    [wallet, session.kind, session.ethAddress, activeChain],
  );

  // Drop the outgoing account's nsk when the session rotates accounts.
  //
  // The cache is keyed by account and lives for the tab's life, so without this
  // a session touching several accounts accumulates one raw spending key per
  // account in `sessionStorage`, readable by any script on the origin. Switching
  // back re-prompts for a derivation.
  const prevAccount = useRef<string | undefined>(session.accountKey);
  useEffect(() => {
    const prev = prevAccount.current;
    prevAccount.current = session.accountKey;
    if (prev && prev !== session.accountKey) clearCachedNsk(prev);
  }, [session.accountKey]);

  const disconnect = useCallback(() => {
    // Every entry, not only the connected address: `clearCachedNsk(address)`
    // would leave the keys of any account used earlier in the session in place.
    clearAllCachedNsk();
    // The two worker pools together hold the ~49 MB zkey, the circuit wasm, a
    // rayon pool and one jubjub wasm instance per scanner worker.
    // None of it is reachable from a disconnected wallet, and any later proof
    // follows a fresh connect.
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

  // Boot the wallet store once at mount: EIP-6963 discovery plus a silent
  // reconnect to the last connected wallet. Prompts only when the site's
  // permission has been revoked. Last, so this effect runs after the provider's
  // own subscriptions are in place.
  useEffect(() => {
    eip1193Store.startDiscovery();
    void eip1193Store.resumeFromStorage();
    // No passkey call here: that store seeds itself from storage at
    // construction, so a returning session is already `connected` on the first
    // render rather than after a second pass over the tree.
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
