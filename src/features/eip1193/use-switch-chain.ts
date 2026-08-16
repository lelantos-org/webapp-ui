import { useCallback } from "react";
import type { ChainEntry } from "@/config/chains";
import { walletStore } from "@/features/eip1193/store";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";

const log = createLogger("eip1193:switch-chain");

/// Move the injected wallet to `target`.
///
/// Lives beside the store rather than on the shielded-wallet context because
/// it is purely an EIP-1193 operation, and because the chain feature needs it:
/// routing it through `useWallet` made `features/chain` depend on
/// `features/wallet`, which already depends on `features/chain`.
///
/// Fire-and-forget with a toast: the caller is a button, the outcome arrives
/// asynchronously through `chainChanged`, and a rejected prompt is a normal
/// user action rather than an error worth propagating.
export function useSwitchChain(): (target: ChainEntry) => void {
  return useCallback((target: ChainEntry) => {
    log.debug("switch requested", { to: target.chainId.toString() });
    void walletStore.switchChain(target).catch((err) => {
      log.warn("switch failed", err);
      toastError("network switch failed", err);
    });
  }, []);
}
