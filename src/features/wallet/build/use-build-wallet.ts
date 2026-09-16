import type { WalletApi } from "@lelantos-org/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { chainKey } from "@/config/chains";
import { useActiveChainOrUndefined } from "@/features/chain";
import { getCachedNsk } from "@/features/wallet-kinds";
import { userMessage } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { waitWithAbort } from "@/shared/lib/wait";
import type { Session } from "../session/session";
import { releaseScanner } from "../sync/scanner";
import { syncProgress } from "../sync/sync-progress-store";
import { createSharedWorkPool } from "./build-pool";

const log = createLogger("wallet:build");

/// Minimum dwell for the "resuming…" UI on cached-nsk rebuilds. Without it,
/// sub-100ms rebuilds render the panel as a brief flash.
const MIN_RESUME_MS = 1000;

const loadBuildWallet = () => import("./build-wallet").then((m) => m.buildWallet);

// Dedupes concurrent builds for one `(chainId, accountKey)` and disposes of a build no
// caller adopts.
//
// Deduplication is required on its own: StrictMode and EIP-1193 store refires
// each run this effect twice, and without it the second `getCachedNsk` check
// beats the first `cacheNsk` write and queues a duplicate derivation prompt.
// Disposal is `createSharedWorkPool`'s responsibility; see the note there.
const buildPool = createSharedWorkPool<WalletApi>((wallet) => {
  log.debug("wallet build adopted by nobody; releasing its scanner");
  releaseScanner(wallet);
});

/// `accountId` is the lowercased `accountKey`; see `BuiltFor`.
const buildKey = (chainId: bigint, accountId: string) => `${chainKey(chainId)}:${accountId}`;

export interface BuildWalletState {
  wallet: WalletApi | undefined;
  error: string | undefined;
  /// True when the per-tab nsk cache already holds this account, distinguishing a
  /// silent rebuild from an incoming derivation prompt, whatever the kind.
  hasCachedKey: boolean;
}

/// A build result together with the identity it belongs to.
///
/// Stored as one value, so currency is a comparison rather than an effect racing
/// to clear it. Clearing by effect leaves a window of one render after the
/// identity changes in which consumers read the previous wallet's balances and
/// Merkle tree.
///
/// The identity is `(chainId, accountKey)`, not `chainId` alone: the nsk, and so
/// the whole shielded wallet, is derived from the account — the EOA for an
/// injected wallet, the credential for a passkey. Keying on the chain alone
/// would let an `accountsChanged` hand out the previous account's wallet, holding
/// status at `ready` against a stale `WalletApi` while the new account's
/// derivation prompt is open, and spending the wrong notes on submit.
///
/// `accountKey` is stored lowercased; the hook compares it as `accountId`.
interface BuiltFor<T> {
  chainId: bigint;
  accountKey: string;
  value: T;
}

/// `value` when it was produced for exactly this `(chainId, accountId)`.
function currentFor<T>(
  built: BuiltFor<T> | undefined,
  chainId: bigint,
  accountId: string | undefined,
): T | undefined {
  if (!built || accountId === undefined) return undefined;
  const same = built.chainId === chainId && built.accountKey === accountId;
  return same ? built.value : undefined;
}

export function useBuildWallet(session: Session): BuildWalletState {
  // Undefined before a wallet connects, and while it sits on a chain this
  // deployment does not serve; in both cases there is nothing to build.
  const activeChain = useActiveChainOrUndefined();
  const chainId = activeChain?.chainId;
  const [built, setBuilt] = useState<BuiltFor<WalletApi> | undefined>();
  const [failure, setFailure] = useState<BuiltFor<string> | undefined>();

  // Derived rather than cleared: a wallet built for another chain or account is
  // not the current one.
  const usable = session.isConnected && chainId !== undefined;
  const accountId = session.accountKey?.toLowerCase();
  const wallet = usable ? currentFor(built, chainId, accountId) : undefined;
  const error = usable ? currentFor(failure, chainId, accountId) : undefined;

  // Disconnect is the case masking cannot cover. `disconnect()` disposes the
  // prover and releases the scanner pool, so the retained `WalletApi` is dead
  // rather than stale, and on reconnect `isConnected` flips back to true before
  // the rebuild finishes, unmasking it and reporting `ready` against disposed
  // workers.
  useEffect(() => {
    if (session.isConnected) return;
    setBuilt(undefined);
    setFailure(undefined);
  }, [session.isConnected]);

  // Side effect of a chain change: the previous chain's scan counter would
  // otherwise remain on screen as though a sync were still running.
  useEffect(() => {
    if (chainId === undefined) return;
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
    // Logs on every run, early return included, which is what makes "why is my
    // wallet not building" answerable. `session.kind` is deliberately not read:
    // it would join the deps for a log line and re-run the build, aborting an
    // open derivation prompt.
    log.debug("effect tick", {
      isConnected: session.isConnected,
      hasLayer: !!session.layer,
    });
    // `activeChain` is the chain gate: it is undefined exactly when the wallet is
    // disconnected or on a network this deployment does not serve, neither of
    // which leaves anything to build against.
    if (!session.isConnected || !session.layer || !session.accountKey || !activeChain) return;

    const ctrl = new AbortController();
    const accountKey = session.accountKey;
    const accountId = accountKey.toLowerCase();
    const layer = session.layer;
    const fromCache = getCachedNsk(accountKey) !== undefined;
    const t0 = performance.now();
    log.debug("building wallet", { kind: layer.kind, fromCache });

    // `buildPool.run` is called synchronously from the effect, before any await,
    // which keeps the waiter count correct: StrictMode's two passes both register
    // before either settles, so the entry cannot be evicted between them and the
    // shared build cannot be disposed out from under the surviving pass. The
    // dynamic import sits inside `make` for the same reason.
    void buildPool
      .run(
        buildKey(activeChain.chainId, accountId),
        async () => {
          const buildWallet = await loadBuildWallet();
          return buildWallet(layer, activeChain, accountKey);
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
            accountKey: accountId,
            value: walletApi,
          });
          return true;
        },
      )
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        // Logged raw, shown friendly: the failure lands on Welcome's card, where
        // an SDK or RPC message would be the only thing the user can read.
        log.error("build failed", e);
        setFailure({
          chainId: activeChain.chainId,
          accountKey: accountId,
          value: userMessage(e),
        });
      });

    return () => ctrl.abort();
  }, [session.isConnected, session.layer, session.accountKey, activeChain]);

  // `accountDigest` is a synchronous sha256, so this is not free. Only
  // consulted while `wallet` is undefined, which is what the deps reflect.
  const hasCachedKey = useMemo(
    () => (session.accountKey ? getCachedNsk(session.accountKey) !== undefined : false),
    [session.accountKey],
  );

  return { wallet, error, hasCachedKey };
}
