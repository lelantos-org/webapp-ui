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

// Keyed by MASP address too: a redeploy under the same chain id must not reuse a stale tree.
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
  const { signer, derive, prompt } = kindAdapter(layer.kind).keySource(layer, chain);

  // Not awaited, and `.catch`: `persist()` throws in some sandboxed and private contexts.
  void requestPersistentStorage()
    .then((granted: boolean) => {
      if (!granted) log.info("storage persistence not granted; caches may be evicted");
    })
    .catch((e: unknown) => log.info("storage persistence request failed", e));

  const nsk = await resolveNsk(derive, accountKey, prompt);

  const network = networkPreset(chain);
  const plan = await timed("fmd.resolveSyncStrategy", () =>
    resolveSyncStrategy(env.fmdUrl, chain.chainId, nsk, accountKey),
  );
  const syncStrategy = plan.strategy;

  if (plan.fallback === "unavailable") {
    log.error("FMD subscription unavailable; scanning every note in the pool");
    toast.warning("Private sync is degraded", {
      description: "The discovery service is unavailable, so syncing will be much slower.",
      duration: 10_000,
    });
  }

  const maspAddress = network.maspAddress;
  const chainOption = signer ? { signer } : { readOnly: true as const };

  // Created outside `connect` so its eagerly spawned workers are disposed if `connect` throws.
  const scanner = createScanner();
  const notes = new IdbNoteStore(storeKey("notes", chain.chainId, maspAddress, accountKey));
  let wallet: WalletApi;
  try {
    wallet = await timed("connect", () =>
      connect({
        network,
        rpcUrl: chain.readRpcUrl,
        nsk,
        // A privacy setting: change is split against the ladder, so this changes what the chain sees.
        denominations: true,
        ...chainOption,
        // Its 4x6 artifacts must match `connect`'s default shape, or every proof has the wrong arity.
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
  return wallet;
}
