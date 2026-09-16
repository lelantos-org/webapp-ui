import { connect, type WalletApi } from "@lelantos-org/sdk";
import { requestPersistentStorage } from "@lelantos-org/sdk/advanced";
import type { Field } from "@lelantos-org/sdk/primitives";
import { type ChainEntry, chainKey } from "@/config/chains";
import { env } from "@/config/env";
import { type ChainLayerSpec, cacheNsk, getCachedNsk, kindAdapter } from "@/features/wallet-kinds";
import { createLogger } from "@/shared/lib/logger";
import { accountDigest } from "@/shared/lib/storage/digest";
import { toast } from "@/shared/lib/toast";
import { sharedProver } from "../prover/prover-worker";
import { holdNoteStore, IdbNoteStore } from "../stores/note-store";
import { IdbNullifierPersistence } from "../stores/nullifier-persistence";
import { IdbTreePersistence } from "../stores/tree-persistence";
import { resolveSyncStrategy } from "../sync/fmd-subscription";
import { createScanner, disposeScanner, holdScanner } from "../sync/scanner";
import { networkPreset } from "./network-preset";
import { instrumentWallet, timed } from "./perf";

const log = createLogger("wallet:build");

/// Resolve the shielded spending key for `accountKey`.
///
/// Cached in sessionStorage because deriving it costs a prompt either way — an
/// EIP-712 signature from an injected wallet, a user-verification unlock from a
/// passkey. On a hit the user is not asked again for the rest of the tab's
/// life.
///
/// The two derivations are domain-separated in the SDK and are not
/// interchangeable: the same person with both an EOA and a passkey has two
/// distinct shielded wallets, which is why `accountKey` and the note-store
/// namespace below are keyed off the kind as well as the account.
async function resolveNsk(
  derive: () => Promise<Field>,
  accountKey: string,
  prompt: string,
): Promise<Field> {
  const cached = getCachedNsk(accountKey);
  if (cached !== undefined) {
    log.info("nsk cache hit; skipping prompt");
    return cached;
  }
  log.info(`nsk cache miss; requesting ${prompt}`);
  const nsk = await timed(`derive:${prompt}`, derive);
  log.info("key derived");
  cacheNsk(accountKey, nsk);
  return nsk;
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
  accountKey: string,
): string {
  return `${kind}:${chainKey(chainId)}:${accountDigest(maspAddress)}:${accountDigest(accountKey)}`;
}

export async function buildWallet(
  layer: ChainLayerSpec,
  chain: ChainEntry,
  accountKey: string,
): Promise<WalletApi> {
  // How this kind produces a key, and whether it has a signer to lend the
  // chain layer. One question, because they are the same one: the signer is
  // exactly what the chain layer would be built from.
  const { signer, derive, prompt } = kindAdapter(layer.kind).keySource(layer, chain);

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

  const nsk = await resolveNsk(derive, accountKey, prompt);

  // Settled before `connect`, since the "matches" strategy addresses its
  // subscription by a token that must be registered first.
  const network = networkPreset(chain);
  const plan = await timed("fmd.resolveSyncStrategy", () =>
    resolveSyncStrategy(env.fmdUrl, chain.chainId, nsk, accountKey),
  );
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

  const maspAddress = network.maspAddress;
  // The chain layer is named, not constructed: `connect` builds a
  // `ViemChainAdapter` from a signer and a `ViemChainReader` from `readOnly`,
  // both off the preset above. Without a signer every read the spend path makes
  // is still on the reader half of the port, so a passkey wallet transfers,
  // withdraws and swaps against exactly that; only deposit needs more, and it
  // refuses at the call — see `session/capabilities.ts`.
  const chainOption = signer ? { signer } : { readOnly: true as const };

  // Hoisted out of the `connect` argument list so it can be disposed if
  // `connect` throws. The pool spawns eagerly, so its workers exist before
  // `connect` is entered; constructed inline, a rejection — a bad RPC, a relayer
  // 500, a tree-cache load that throws — would leave them unreferenced, leaking
  // a pool per `useBuildWallet` retry.
  const scanner = createScanner();
  const notes = new IdbNoteStore(storeKey("notes", chain.chainId, maspAddress, accountKey));
  let wallet: WalletApi;
  try {
    wallet = await timed("connect", () =>
      connect({
        network,
        rpcUrl: chain.readRpcUrl,
        nsk,
        // Every asset gets a ladder, derived by the SDK from its own `scale`
        // and `decimals`. Named rather than left to default because it is a
        // privacy setting: `wallet.asset().ladder` is what the spend path
        // splits change against, so turning it off changes what the chain
        // publishes, not just what the form offers.
        denominations: true,
        ...chainOption,
        // The module-level worker, shared by every wallet in the tab and warmed
        // on intent to transact (`preloadProverWorker`). It bundles the 4x6
        // artifacts, which is also the SDK's default `shape`: the two must agree
        // or every proof is built at the wrong arity, and `connect`'s default is
        // the only shape the circuits package publishes keys for.
        prover: sharedProver(),
        storage: {
          notes,
          tree: new IdbTreePersistence(storeKey("tree", chain.chainId, maspAddress, accountKey)),
          nullifiers: new IdbNullifierPersistence(
            storeKey("nullifiers", chain.chainId, maspAddress, accountKey),
          ),
        },
        scanner,
        syncStrategy,
      }),
    );
  } catch (e) {
    await disposeScanner(scanner);
    throw e;
  }

  holdScanner(wallet, scanner);
  holdNoteStore(wallet, notes);
  instrumentWallet(wallet);
  log.info("ready", wallet.address);
  // The prover is warmed on intent to transact rather than here. See
  // `preloadProverWorker`.
  return wallet;
}
