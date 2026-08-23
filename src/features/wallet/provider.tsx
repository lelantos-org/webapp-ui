// React context wiring for the SDK wallet.

import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { closeDepositStreams } from "@/features/relayer/deposit-stream";
import { clearAllCachedNsk, clearCachedNsk } from "@/features/wallet/nsk-session-cache";
import { disposeProverWorker } from "@/features/wallet/prover/proverWorker";
import { releaseScanner } from "@/features/wallet/scanner";
import type { WalletContextValue } from "@/features/wallet/types";
import { useBuildWallet } from "@/features/wallet/use-build-wallet";
import { useConnectFlow } from "@/features/wallet/use-connect-flow";
import { useConnection } from "@/features/wallet/use-connection";
import { WalletContext } from "@/features/wallet/use-wallet";
import { WalletPicker } from "@/features/wallet/WalletPicker";
import { deriveWalletStatus } from "@/features/wallet/wallet-status";
import { toastInfo } from "@/shared/lib/toast";

export function WalletProvider({ children }: { children: ReactNode }) {
  const conn = useConnection();
  const { wallet, error: deriveError, hasCachedKey } = useBuildWallet(conn);
  // The picker lives here rather than at each connect button: `connect` becomes
  // "start the flow", so every call site stays a plain onClick and no picker
  // state has to be threaded through them.
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
  // The cache is keyed by address and survives for the tab's life, so a session
  // that touched several accounts used to accumulate one raw spending key per
  // account in `sessionStorage` — every one of them readable by any script on
  // the origin, long after the user had moved on. Switching back re-prompts for
  // a signature, which is the correct price for not leaving spend authority
  // lying around for accounts that are no longer in use.
  const prevAddress = useRef<string | undefined>(conn.address);
  useEffect(() => {
    const prev = prevAddress.current;
    prevAddress.current = conn.address;
    if (prev && prev !== conn.address) clearCachedNsk(prev);
  }, [conn.address]);

  const disconnect = useCallback(() => {
    // Every entry, not just the connected address: `clearCachedNsk(address)`
    // left behind the keys of any account used earlier in the session, so
    // "disconnect" did not actually revoke what it appeared to.
    clearAllCachedNsk();
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
