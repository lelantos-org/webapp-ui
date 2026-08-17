import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { useEffect, useRef, useState } from "react";
import { chainKey } from "@/config/chains";
import { useActiveChainOrUndefined } from "@/features/chain/ChainProvider";
import { closeDepositStreamsExcept } from "@/features/relayer/deposit-stream";
import { getCachedNsk } from "@/features/wallet/nsk-session-cache";
import { releaseScanner } from "@/features/wallet/scanner";
import { syncProgress } from "@/features/wallet/sync-progress-store";
import type { Connection } from "@/features/wallet/use-connection";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("wallet:build");

/// Minimum dwell for the "resuming…" UI on cached-nsk rebuilds. Without it,
/// sub-100ms rebuilds render the panel as a brief flash.
const MIN_RESUME_MS = 1000;

const loadBuildWallet = () => import("@/features/wallet/buildWallet").then((m) => m.buildWallet);

// Dedupe concurrent builds for the same `(chainId, addr)` — StrictMode and
// EIP-1193 store refires can both fire the effect twice, queueing a duplicate
// EIP-712 prompt because the second `getCachedNsk` check beats the first
// `cacheNsk` write.
const inflight = new Map<string, Promise<WalletApi>>();
const inflightKey = (chainId: bigint, addr: string) => `${chainKey(chainId)}:${addr.toLowerCase()}`;

export interface BuildWalletState {
  wallet: WalletApi | undefined;
  error: string | undefined;
  /// True if the per-tab nsk cache already has this address — distinguishes
  /// "silent rebuild" from "EIP-712 prompt incoming".
  hasCachedKey: boolean;
}

/// A build result together with the chain it belongs to.
///
/// Stored as one value so "is this still current?" is a comparison rather than
/// an effect racing to clear it. Clearing by effect leaves a window — one
/// render after the chain changes — in which consumers read the previous
/// chain's balances and Merkle tree, and it puts the invariant somewhere other
/// than where the value is used.
interface BuiltFor<T> {
  chainId: bigint;
  value: T;
}

/// `value` when it was produced for `chainId`, otherwise `undefined`.
function currentFor<T>(built: BuiltFor<T> | undefined, chainId: bigint): T | undefined {
  return built?.chainId === chainId ? built.value : undefined;
}

export function useBuildWallet(conn: Connection): BuildWalletState {
  // Undefined before a wallet connects, and while it sits on a chain this
  // deployment does not serve. Both mean there is nothing to build.
  const activeChain = useActiveChainOrUndefined();
  const chainId = activeChain?.chainId;
  const [built, setBuilt] = useState<BuiltFor<WalletApi> | undefined>();
  const [failure, setFailure] = useState<BuiltFor<string> | undefined>();

  // Derived, not cleared: a wallet built for another chain, or built before a
  // disconnect, is by definition not the current one.
  const usable = conn.isConnected && chainId !== undefined;
  const wallet = usable ? currentFor(built, chainId) : undefined;
  const error = usable ? currentFor(failure, chainId) : undefined;

  // The genuine side effects of a chain change. The previous chain's SSE feed
  // has no reader left, and its scan counter would otherwise sit on screen as
  // though a sync were still running.
  useEffect(() => {
    if (chainId === undefined) return;
    closeDepositStreamsExcept(chainId);
    syncProgress.finished();
  }, [chainId]);

  // Release the superseded build's scanner workers. `built` is replaced rather
  // than cleared on a chain or account switch, so each switch would otherwise
  // strand a worker pool, each worker holding a jubjub wasm instance, for the
  // lifetime of the page. `releaseScanner` is idempotent, and the identity
  // check prevents StrictMode's double-invoke from releasing a live pool.
  const prevBuilt = useRef<WalletApi | undefined>(undefined);
  useEffect(() => {
    const prev = prevBuilt.current;
    prevBuilt.current = built?.value;
    if (prev && prev !== built?.value) releaseScanner(prev);
  }, [built]);

  useEffect(() => {
    log.debug("effect tick", {
      isConnected: conn.isConnected,
      hasBundle: !!conn.bundle,
      address: conn.address,
    });
    // `activeChain` is the chain gate: it is undefined exactly when the wallet
    // is disconnected or on a network this deployment does not serve, and
    // neither leaves anything to build against.
    if (!conn.isConnected || !conn.bundle || !conn.address || !activeChain) return;

    const ctrl = new AbortController();
    const addr = conn.address;
    const fromCache = getCachedNsk(addr) !== undefined;
    const t0 = performance.now();
    log.debug("building wallet", { address: addr, fromCache });

    (async () => {
      try {
        const buildWallet = await loadBuildWallet();
        if (!conn.bundle) return;
        const bundle = conn.bundle;
        const k = inflightKey(activeChain.chainId, addr);
        let p = inflight.get(k);
        if (!p) {
          p = buildWallet(bundle, activeChain).finally(() => {
            if (inflight.get(k) === p) inflight.delete(k);
          });
          inflight.set(k, p);
        }
        const walletApi = await p;
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
        setBuilt({ chainId: activeChain.chainId, value: walletApi });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        log.error("build failed", e);
        setFailure({
          chainId: activeChain.chainId,
          value: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    return () => ctrl.abort();
  }, [conn.isConnected, conn.bundle, conn.address, activeChain]);

  const hasCachedKey = conn.address ? getCachedNsk(conn.address) !== undefined : false;

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
