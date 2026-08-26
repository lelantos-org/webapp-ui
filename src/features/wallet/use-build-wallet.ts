import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { useEffect, useRef, useState } from "react";
import { chainKey } from "@/config/chains";
import { useActiveChainOrUndefined } from "@/features/chain";
import { closeDepositStreamsExcept } from "@/features/relayer";
import { describeError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { createSharedWorkPool } from "./build-pool";
import { getCachedNsk } from "./nsk-session-cache";
import { releaseScanner } from "./scanner";
import { syncProgress } from "./sync-progress-store";
import type { Connection } from "./use-connection";

const log = createLogger("wallet:build");

/// Minimum dwell for the "resuming…" UI on cached-nsk rebuilds. Without it,
/// sub-100ms rebuilds render the panel as a brief flash.
const MIN_RESUME_MS = 1000;

const loadBuildWallet = () => import("./build-wallet").then((m) => m.buildWallet);

// Dedupes concurrent builds for one `(chainId, addr)` and disposes of a build no
// caller adopts.
//
// Deduplication is required on its own: StrictMode and EIP-1193 store refires
// each run this effect twice, and without it the second `getCachedNsk` check
// beats the first `cacheNsk` write and queues a duplicate EIP-712 prompt.
// Disposal is `createSharedWorkPool`'s responsibility; see the note there.
const buildPool = createSharedWorkPool<WalletApi>((wallet) => {
  log.debug("wallet build adopted by nobody; releasing its scanner");
  releaseScanner(wallet);
});

const buildKey = (chainId: bigint, addr: string) => `${chainKey(chainId)}:${addr.toLowerCase()}`;

export interface BuildWalletState {
  wallet: WalletApi | undefined;
  error: string | undefined;
  /// True when the per-tab nsk cache already holds this address, distinguishing a
  /// silent rebuild from an incoming EIP-712 prompt.
  hasCachedKey: boolean;
}

/// A build result together with the identity it belongs to.
///
/// Stored as one value, so currency is a comparison rather than an effect racing
/// to clear it. Clearing by effect leaves a window of one render after the
/// identity changes in which consumers read the previous wallet's balances and
/// Merkle tree.
///
/// The identity is `(chainId, address)`, not `chainId` alone: the nsk, and so the
/// whole shielded wallet, is derived from the EOA. Keying on the chain alone
/// would let an `accountsChanged` hand out the previous account's wallet, holding
/// status at `ready` against a stale `WalletApi` while the new account's EIP-712
/// prompt is open, and spending the wrong notes on submit.
interface BuiltFor<T> {
  chainId: bigint;
  address: string;
  value: T;
}

/// `value` when it was produced for exactly this `(chainId, address)`.
function currentFor<T>(
  built: BuiltFor<T> | undefined,
  chainId: bigint,
  address: string | undefined,
): T | undefined {
  if (!built || address === undefined) return undefined;
  const same = built.chainId === chainId && built.address === address.toLowerCase();
  return same ? built.value : undefined;
}

export function useBuildWallet(conn: Connection): BuildWalletState {
  // Undefined before a wallet connects, and while it sits on a chain this
  // deployment does not serve; in both cases there is nothing to build.
  const activeChain = useActiveChainOrUndefined();
  const chainId = activeChain?.chainId;
  const [built, setBuilt] = useState<BuiltFor<WalletApi> | undefined>();
  const [failure, setFailure] = useState<BuiltFor<string> | undefined>();

  // Derived rather than cleared: a wallet built for another chain or account is
  // not the current one.
  const usable = conn.isConnected && chainId !== undefined;
  const wallet = usable ? currentFor(built, chainId, conn.address) : undefined;
  const error = usable ? currentFor(failure, chainId, conn.address) : undefined;

  // Disconnect is the case masking cannot cover. `disconnect()` disposes the
  // prover and releases the scanner pool, so the retained `WalletApi` is dead
  // rather than stale, and on reconnect `isConnected` flips back to true before
  // the rebuild finishes, unmasking it and reporting `ready` against disposed
  // workers.
  useEffect(() => {
    if (conn.isConnected) return;
    setBuilt(undefined);
    setFailure(undefined);
  }, [conn.isConnected]);

  // Side effects of a chain change: the previous chain's SSE feed has no reader
  // left, and its scan counter would otherwise remain on screen as though a sync
  // were still running.
  useEffect(() => {
    if (chainId === undefined) return;
    closeDepositStreamsExcept(chainId);
    syncProgress.reset();
  }, [chainId]);

  // Release the superseded build's scanner workers. `built` is replaced rather
  // than cleared on a chain or account switch, so each switch would otherwise
  // strand a worker pool — each worker holding a jubjub wasm instance — for the
  // life of the page. `releaseScanner` is idempotent, and the identity check
  // keeps StrictMode's double-invoke from releasing a live pool.
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
    // `activeChain` is the chain gate: it is undefined exactly when the wallet is
    // disconnected or on a network this deployment does not serve, neither of
    // which leaves anything to build against.
    if (!conn.isConnected || !conn.bundle || !conn.address || !activeChain) return;

    const ctrl = new AbortController();
    const addr = conn.address;
    const bundle = conn.bundle;
    const fromCache = getCachedNsk(addr) !== undefined;
    const t0 = performance.now();
    log.debug("building wallet", { address: addr, fromCache });

    // `buildPool.run` is called synchronously from the effect, before any await,
    // which keeps the waiter count correct: StrictMode's two passes both register
    // before either settles, so the entry cannot be evicted between them and the
    // shared build cannot be disposed out from under the surviving pass. The
    // dynamic import sits inside `make` for the same reason.
    void buildPool
      .run(
        buildKey(activeChain.chainId, addr),
        async () => {
          const buildWallet = await loadBuildWallet();
          return buildWallet(bundle, activeChain);
        },
        async (walletApi) => {
          if (ctrl.signal.aborted) return false;
          // Hold the "resuming…" panel briefly on a cached-nsk rebuild, which
          // otherwise completes in under 100ms and renders as a flash.
          if (fromCache) {
            const remaining = MIN_RESUME_MS - (performance.now() - t0);
            if (remaining > 0) await waitWithAbort(remaining, ctrl.signal);
            if (ctrl.signal.aborted) return false;
          }
          setBuilt({
            chainId: activeChain.chainId,
            address: addr.toLowerCase(),
            value: walletApi,
          });
          return true;
        },
      )
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        log.error("build failed", e);
        setFailure({
          chainId: activeChain.chainId,
          address: addr.toLowerCase(),
          value: describeError(e),
        });
      });

    return () => ctrl.abort();
  }, [conn.isConnected, conn.bundle, conn.address, activeChain]);

  const hasCachedKey = conn.address ? getCachedNsk(conn.address) !== undefined : false;

  return { wallet, error, hasCachedKey };
}

/// Resolves after `ms`, or as soon as `signal` aborts.
///
/// Resolves rather than rejects on abort, so callers must re-check
/// `signal.aborted` afterwards. `{ once: true }` keeps an abandoned wait from
/// retaining its listener on a long-lived signal.
function waitWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });
}
