import {
  connect,
  deriveNskFromSigner,
  Eip1193Signer,
  type EthSigner,
  evmAddress,
  TRANSACT_4X6,
} from "@lelantos-org/sdk";
import { ViemChainAdapter } from "@lelantos-org/sdk/chain";
import { requestPersistentStorage } from "@lelantos-org/sdk/core";
import type { Field } from "@lelantos-org/sdk/crypto";
import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { toast } from "sonner";
import { type ChainEntry, chainKey } from "@/config/chains";
import { env } from "@/config/env";
import { createLogger } from "@/shared/lib/logger";
import { accountDigest } from "@/shared/lib/storage-digest";
import { resolveSyncStrategy } from "./fmd-subscription";
import { networkPreset } from "./network-preset";
import { cacheNsk, getCachedNsk } from "./nsk-session-cache";
import { instrumentWallet, timed } from "./perf";
import { getProverWorker } from "./prover/prover-worker";
import { createScanner } from "./scanner";
import { IdbNoteStore } from "./stores/note-store";
import { IdbNullifierPersistence } from "./stores/nullifier-store";
import { IdbTreePersistence } from "./stores/tree-store";
import type { ConnectionBundle } from "./use-connection";

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

/// `NetworkPreset` types the deployment addresses as nullable, where `null` marks
/// a network the pool is not deployed on. `connect` rejects those as well, but
/// the adapter is built first, so the check happens here.
function requireAddress(value: string | null, field: string): string {
  if (!value) throw new Error(`network preset has no ${field}; pool is not deployed on this chain`);
  return value;
}

/// Namespace persisted stores per (deployment, account) so switching either
/// does not read another wallet's notes or Merkle tree.
///
/// Unlike the nsk, these are per-chain: the notes, the tree and the spent set
/// describe one pool on one chain, even though the key decrypting them is the
/// same everywhere.
///
/// The chain id alone does not identify the pool. Redeploy the MASP under the
/// same id — every `anvil` restart, every devnet reset, every re-indexed
/// backend — and the leaves behind these keys describe a tree that no longer
/// exists. The Merkle feed is append-only, so a stale tree is not something a
/// resync can repair: it surfaces as a local root the chain has never held and
/// a spend that refuses to prepare. Folding the MASP address in gives each
/// deployment its own namespace, which turns that into a cold sync instead.
///
/// Both addresses are digested rather than written out; see `accountDigest`.
/// The nullifier store holds a global feed rather than wallet-specific data,
/// but is keyed the same way so one wallet's records share a namespace and
/// `db.ts`'s version drop clears them together.
function storeKey(
  kind: "notes" | "tree" | "nullifiers",
  chainId: bigint,
  maspAddress: string,
  ethAddr: string,
): string {
  return `${kind}:${chainKey(chainId)}:${accountDigest(maspAddress)}:${accountDigest(ethAddr)}`;
}

export async function buildWallet(bundle: ConnectionBundle, chain: ChainEntry): Promise<WalletApi> {
  const ethAddr = bundle.address;
  const signer = new Eip1193Signer(bundle.provider, evmAddress(ethAddr), chain.chainId);

  // Requested before anything is written, so the note, tree and nullifier stores
  // and the ~49 MB zkey land in storage exempt from eviction. Not awaited:
  // Chrome decides on an engagement heuristic and Safari may prompt, and neither
  // should hold up the wallet.
  //
  // `.catch` rather than a bare `void`, since `navigator.storage.persist()`
  // throws in some sandboxed and privacy-mode contexts.
  void requestPersistentStorage()
    .then((granted: boolean) => {
      if (!granted) log.info("storage persistence not granted; caches may be evicted");
    })
    .catch((e: unknown) => log.info("storage persistence request failed", e));

  const nsk = await resolveNsk(signer, ethAddr);

  // Settled before `connect`, since the "matches" strategy addresses its
  // subscription by a token that must be registered first.
  const [network, plan] = await Promise.all([
    networkPreset(chain),
    timed("fmd.resolveSyncStrategy", () =>
      resolveSyncStrategy(env.fmdUrl, chain.chainId, nsk, ethAddr),
    ),
  ]);
  const syncStrategy = plan.strategy;

  // Only the `unavailable` fallback warrants a warning. The firehose
  // trial-decrypts every note in the system, so on a full-sized pool this is the
  // difference between a sync measured in seconds and one measured in minutes.
  //
  // `poolTooSmall` is the same code path on a pool below the decoy floor, where
  // the full set is a few hundred notes and the sync is imperceptible — the
  // ordinary state of a fresh deployment. Declining to subscribe there is the
  // more private choice, so it is logged at info by `ensureFmdSubscription`
  // with the counts rather than surfaced as degraded privacy.
  if (plan.fallback === "unavailable") {
    log.error("FMD subscription unavailable; scanning every note in the pool");
    toast.warning("Private sync is degraded", {
      description: "The discovery service is unavailable, so syncing will be much slower.",
      duration: 10_000,
    });
  }

  // Built here rather than left to `connect`: `NetworkPreset` carries no
  // `nativeAdapterAddress`, so the adapter `connect` would build reports
  // native-ETH deposits and `withdrawEth` as unsupported. Everything else
  // matches the SDK's defaults.
  const maspAddress = requireAddress(network.maspAddress, "maspAddress");
  const chainAdapter = new ViemChainAdapter({
    rpcUrl: chain.rpcUrl,
    signer,
    chainId: network.chainId,
    maspAddress,
    permit2Address: network.permit2Address,
    nativeAdapterAddress: chain.nativeAdapterAddress,
  });

  // Hoisted out of the `connect` argument list so it can be disposed if
  // `connect` throws. The pool spawns eagerly, so its workers exist before
  // `connect` is entered; constructed inline, a rejection — a bad RPC, a relayer
  // 500, a tree-cache load that throws — would leave them unreferenced, leaking
  // a pool per `useBuildWallet` retry.
  const scanner = createScanner();
  let wallet: WalletApi;
  try {
    wallet = await timed("connect", () =>
      connect({
        network,
        nsk,
        // Stated rather than inherited: the prover worker bundles the 4x6
        // artifacts, and the two must agree or every proof is built at the wrong
        // arity. Currently the only shape the circuits package publishes keys
        // for, so the default would do — but naming it is what pins the artifact
        // pair the worker loads.
        shape: TRANSACT_4X6,
        // Every asset gets a ladder, derived by the SDK from its own `scale`
        // and `decimals`. Named rather than left to default because it is a
        // privacy setting: `wallet.asset().ladder` is what the spend path
        // splits change against, so turning it off changes what the chain
        // publishes, not just what the form offers.
        denominations: true,
        chain: chainAdapter,
        prover: getProverWorker(),
        noteStore: new IdbNoteStore(storeKey("notes", chain.chainId, maspAddress, ethAddr)),
        treePersistence: new IdbTreePersistence(
          storeKey("tree", chain.chainId, maspAddress, ethAddr),
        ),
        nullifierPersistence: new IdbNullifierPersistence(
          storeKey("nullifiers", chain.chainId, maspAddress, ethAddr),
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
  // The prover is warmed on intent to transact rather than here. See
  // `preloadProverWorker`.
  return wallet;
}
