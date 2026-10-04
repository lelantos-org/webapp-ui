import { useEffect } from "react";
import { createLogger } from "@/shared/lib/logger";
import { savesData } from "@/shared/lib/platform";
import { whenIdle } from "@/shared/lib/when-idle";
import { preloadProverWorker } from "../prover/prover-worker";
import { useWalletInstance } from "../session/context";
import { useWalletState } from "./use-wallet-state";

const log = createLogger("wallet:warmup");

/// Readies a funded wallet for its next spend while the browser is idle: the prover (worker,
/// proving key, thread pool) and the commitment tree, which a spend otherwise fetches and hashes
/// before it starts proving.
export function useSpendWarmup(): void {
  const wallet = useWalletInstance();
  const { data } = useWalletState();
  const funded = !!data?.balances.some((b) => b.balance > 0n);

  useEffect(() => {
    if (!wallet || !funded) return;
    return whenIdle(() => {
      // The proving key is tens of megabytes.
      if (!savesData()) void preloadProverWorker();
      void wallet
        .sync({ scope: "full" })
        .catch((e: unknown) => log.debug("tree warm-up failed; the spend will sync it", e));
    });
  }, [wallet, funded]);
}
