import { useCallback } from "react";
import type { ChainEntry } from "@/config/chains";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";
import { walletStore } from "./store";

const log = createLogger("eip1193:switch-chain");

/// Move the injected wallet to `target`.
///
/// Lives beside the store rather than on the shielded-wallet context: it is
/// purely an EIP-1193 operation, and `features/chain` needs it, so routing it
/// through `useWallet` would make `features/chain` depend on `features/wallet`,
/// which already depends on `features/chain`.
///
/// Fire-and-forget with a toast: the caller is a button, the outcome arrives
/// asynchronously through `chainChanged`, and a rejected prompt is a normal user
/// action rather than an error to propagate.
export function useSwitchChain(): (target: ChainEntry) => void {
  return useCallback((target: ChainEntry) => {
    log.debug("switch requested", { to: target.chainId.toString() });
    void walletStore.switchChain(target).catch((err) => {
      log.warn("switch failed", err);
      toastError("network switch failed", err);
    });
  }, []);
}
