import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { useEffect, useState } from "react";
import { env } from "@/config/env";
import { getCachedNsk } from "@/features/wallet/nsk-session-cache";
import type { Connection } from "@/features/wallet/use-connection";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("wallet:build");

/// Min dwell for the "resuming…" UI on cached-nsk rebuilds — without it,
/// sub-100ms rebuilds flash the panel as a glitch.
const MIN_RESUME_MS = 1000;

const loadBuildWallet = () => import("@/features/wallet/buildWallet").then((m) => m.buildWallet);

// Dedupe concurrent builds for the same `(chainId, addr)` — StrictMode and
// wallet-store refires can both fire the effect twice, queueing a duplicate
// EIP-712 prompt because the second `getCachedNsk` check beats the first
// `cacheNsk` write.
const inflight = new Map<string, Promise<WalletApi>>();
const inflightKey = (chainId: bigint, addr: string) =>
  `${chainId.toString(16)}:${addr.toLowerCase()}`;

export interface BuildWalletState {
  wallet: WalletApi | undefined;
  error: string | undefined;
  /// True if the per-tab nsk cache already has this address — distinguishes
  /// "silent rebuild" from "EIP-712 prompt incoming".
  hasCachedKey: boolean;
}

export function useBuildWallet(conn: Connection): BuildWalletState {
  const [wallet, setWallet] = useState<WalletApi | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!conn.isConnected) {
      setWallet(undefined);
      setError(undefined);
    }
  }, [conn.isConnected]);

  useEffect(() => {
    log.debug("effect tick", {
      isConnected: conn.isConnected,
      chainOk: conn.chainOk,
      hasBundle: !!conn.bundle,
      address: conn.address,
    });
    if (!conn.isConnected || !conn.chainOk || !conn.bundle || !conn.address) return;

    const ctrl = new AbortController();
    const addr = conn.address;
    const fromCache = getCachedNsk(env.chainId, addr) !== undefined;
    const t0 = performance.now();
    log.debug("building wallet", { address: addr, fromCache });
    setError(undefined);

    (async () => {
      try {
        const buildWallet = await loadBuildWallet();
        if (!conn.bundle) return;
        const bundle = conn.bundle;
        const k = inflightKey(env.chainId, addr);
        let p = inflight.get(k);
        if (!p) {
          p = buildWallet(bundle).finally(() => {
            if (inflight.get(k) === p) inflight.delete(k);
          });
          inflight.set(k, p);
        }
        const built = await p;
        if (ctrl.signal.aborted) {
          log.debug("build superseded; discarding", { address: addr });
          return;
        }
        if (fromCache) {
          const remaining = MIN_RESUME_MS - (performance.now() - t0);
          if (remaining > 0) {
            await waitWithAbort(remaining, ctrl.signal);
            if (ctrl.signal.aborted) return;
          }
        }
        setWallet(built);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        log.error("build failed", e);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => ctrl.abort();
  }, [conn.isConnected, conn.chainOk, conn.bundle, conn.address]);

  const hasCachedKey = conn.address ? getCachedNsk(env.chainId, conn.address) !== undefined : false;

  return { wallet, error, hasCachedKey };
}

function waitWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(id);
      resolve();
    });
  });
}
