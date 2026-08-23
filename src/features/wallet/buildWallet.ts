import {
  connect,
  deriveNskFromSigner,
  Eip1193Signer,
  type EthSigner,
  evmAddress,
} from "@lelantos-org/sdk";
import { ViemChainAdapter } from "@lelantos-org/sdk/chain";
import { requestPersistentStorage } from "@lelantos-org/sdk/core";
import type { Field } from "@lelantos-org/sdk/crypto";
import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { toast } from "sonner";
import { type ChainEntry, chainKey } from "@/config/chains";
import { env } from "@/config/env";
import { resolveSyncStrategy } from "@/features/wallet/fmd-subscription";
import { networkPreset } from "@/features/wallet/network-preset";
import { cacheNsk, getCachedNsk } from "@/features/wallet/nsk-session-cache";
import { instrumentWallet, timed } from "@/features/wallet/perf";
import { getProverWorker } from "@/features/wallet/prover/proverWorker";
import { createScanner } from "@/features/wallet/scanner";
import { IdbNoteStore } from "@/features/wallet/stores/noteStore";
import { IdbNullifierPersistence } from "@/features/wallet/stores/nullifierStore";
import { IdbTreePersistence } from "@/features/wallet/stores/treeStore";
import type { ConnectionBundle } from "@/features/wallet/use-connection";
import { createLogger } from "@/shared/lib/logger";
import { accountDigest } from "@/shared/lib/storage-digest";

const log = createLogger("wallet:build");

/// Resolve the shielded spending key for `ethAddr`.
///
/// Cached in sessionStorage because deriving it costs an EIP-712 prompt: on a
/// hit the user is not asked to sign again for the rest of the tab's life.
async function resolveNsk(signer: EthSigner, ethAddr: string): Promise<Field> {
  const cached = getCachedNsk(ethAddr);
  if (cached !== undefined) {
    log.info("nsk cache hit; skipping EIP-712 prompt", ethAddr);
    return cached;
  }
  log.info("nsk cache miss; requesting EIP-712 signature");
  const nsk = await timed("deriveNskFromSigner", () => deriveNskFromSigner(signer));
  log.info("signature received");
  cacheNsk(ethAddr, nsk);
  return nsk;
}

/// `NetworkPreset` types the deployment addresses as nullable — `null` marks a
/// network the pool is not deployed on. `connect` rejects those too, but the
/// adapter is built first, so the check has to happen here.
function requireAddress(value: string | null, field: string): string {
  if (!value) throw new Error(`network preset has no ${field}; pool is not deployed on this chain`);
  return value;
}

/// Namespace persisted stores per (chain, account) so switching either does
/// not read another wallet's notes or Merkle tree.
///
/// Unlike the nsk, these genuinely are per-chain: the notes, the tree and the
/// spent set describe one pool on one chain, even though the key that decrypts
/// them is the same everywhere.
///
/// The address is digested rather than written out — see `accountDigest`. The
/// nullifier store holds a global feed rather than anything wallet-specific,
/// but it is keyed the same way so one wallet's records share a namespace and
/// `db.ts`'s version drop clears them together.
function storeKey(kind: "notes" | "tree" | "nullifiers", chainId: bigint, ethAddr: string): string {
  return `${kind}:${chainKey(chainId)}:${accountDigest(ethAddr)}`;
}

export async function buildWallet(bundle: ConnectionBundle, chain: ChainEntry): Promise<WalletApi> {
  const ethAddr = bundle.address;
  const signer = new Eip1193Signer(bundle.provider, evmAddress(ethAddr), chain.chainId);

  // Ask before anything is written, so the note/tree/nullifier stores and the
  // ~49 MB zkey land in storage that is already exempt from eviction. Not
  // awaited: Chrome decides on an engagement heuristic and Safari may prompt,
  // and neither outcome should hold up the wallet.
  // `.catch`, not just `void`: `void` silences the lint, not the rejection, and
  // `navigator.storage.persist()` throws outright in some sandboxed and
  // privacy-mode contexts.
  void requestPersistentStorage()
    .then((granted: boolean) => {
      if (!granted) log.info("storage persistence not granted; caches may be evicted");
    })
    .catch((e: unknown) => log.info("storage persistence request failed", e));

  const nsk = await resolveNsk(signer, ethAddr);

  // Settled before `connect`, since the "matches" strategy addresses its
  // subscription by a token that has to be registered first.
  const [network, plan] = await Promise.all([
    networkPreset(chain),
    timed("fmd.resolveSyncStrategy", () =>
      resolveSyncStrategy(env.fmdUrl, chain.chainId, nsk, ethAddr),
    ),
  ]);
  const syncStrategy = plan.strategy;

  // Only the `unavailable` fallback is worth alarming about. With a correct
  // sync cursor the firehose trial-decrypts every note in the system rather
  // than the first page of them, so on a full-sized pool this is the
  // difference between a sync measured in seconds and one measured in
  // minutes. Loud on purpose.
  //
  // `poolTooSmall` is the same code path at a pool below the decoy floor,
  // where "every note in the system" is under a couple of hundred of them and
  // the sync is imperceptible — the ordinary state of a fresh deployment.
  // Reporting degraded privacy there would be false: declining to subscribe
  // is the more private choice, which is why `resolveSyncStrategy` makes it.
  // It is logged at info by `ensureFmdSubscription`, with the counts.
  if (plan.fallback === "unavailable") {
    log.error("FMD subscription unavailable; scanning every note in the pool");
    toast.warning("Private sync is degraded", {
      description: "The discovery service is unavailable, so syncing will be much slower.",
      duration: 10_000,
    });
  }

  // Built here rather than left to `connect`: `NetworkPreset` carries no
  // `nativeAdapterAddress`, so the adapter it would build reports native-ETH
  // deposits and `withdrawEth` as unsupported. Everything else matches the
  // SDK's own defaults.
  const chainAdapter = new ViemChainAdapter({
    rpcUrl: chain.rpcUrl,
    signer,
    chainId: network.chainId,
    maspAddress: requireAddress(network.maspAddress, "maspAddress"),
    permit2Address: network.permit2Address,
    nativeAdapterAddress: chain.nativeAdapterAddress,
  });

  // Hoisted out of the `connect` argument list, and disposed if `connect`
  // throws. The pool spawns eagerly, so its workers exist before `connect` is
  // entered; passed inline, a rejection (bad RPC, relayer 500, a tree-cache
  // load that throws) left them with no reference and no owner. `useBuildWallet`
  // retries on the next connection change, so that leaked a pool per attempt.
  const scanner = createScanner();
  let wallet: WalletApi;
  try {
    wallet = await timed("connect", () =>
      connect({
        network,
        nsk,
        chain: chainAdapter,
        prover: getProverWorker(),
        noteStore: new IdbNoteStore(storeKey("notes", chain.chainId, ethAddr)),
        treePersistence: new IdbTreePersistence(storeKey("tree", chain.chainId, ethAddr)),
        nullifierPersistence: new IdbNullifierPersistence(
          storeKey("nullifiers", chain.chainId, ethAddr),
        ),
        scanner,
        syncStrategy,
      }),
    );
  } catch (e) {
    await Promise.resolve()
      .then(() => scanner.dispose?.())
      .catch((disposeErr: unknown) => log.warn("scanner dispose failed", disposeErr));
    throw e;
  }

  instrumentWallet(wallet);
  log.info("ready", wallet.address);
  // The prover is not warmed here; it is warmed on intent to transact. See
  // `preloadProverWorker`.
  return wallet;
}
