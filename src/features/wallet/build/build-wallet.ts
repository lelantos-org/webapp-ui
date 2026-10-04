import type { WalletApi } from "@lelantos-org/sdk";
import { requestPersistentStorage } from "@lelantos-org/sdk/advanced";
import type { Field } from "@lelantos-org/sdk/primitives";
import { type ChainEntry, chainKey } from "@/config/chains";
import { type ChainLayerSpec, cacheNsk, getCachedNsk, kindAdapter } from "@/features/wallet-kinds";
import { createLogger } from "@/shared/lib/logger";
import { accountDigest } from "@/shared/lib/storage/digest";
import { toast } from "@/shared/lib/toast";
import { walletDb } from "../stores/db";
import { holdNoteStore, IdbNoteStore } from "../stores/note-store";
import { IdbNullifierPersistence } from "../stores/nullifier-persistence";
import { IdbTreePersistence } from "../stores/tree-persistence";
import { connectWallet } from "./connect-wallet";
import { timed } from "./perf";

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
  /// Called once the key is in hand: any prompt is answered, and the rest needs nothing of the user.
  onKey?: () => void,
): Promise<WalletApi> {
  const { signer, derive, prompt } = kindAdapter(layer.kind).keySource(layer, chain);

  // Not awaited, and `.catch`: `persist()` throws in some sandboxed and private contexts.
  void requestPersistentStorage()
    .then((granted: boolean) => {
      if (!granted) log.info("storage persistence not granted; caches may be evicted");
    })
    .catch((e: unknown) => log.info("storage persistence request failed", e));

  // Open the database while the key and the sync plan resolve; `connect` reads it next.
  void walletDb().catch(() => {});

  const nsk = await resolveNsk(derive, accountKey, prompt);
  onKey?.();

  const maspAddress = chain.maspAddress;
  const notes = new IdbNoteStore(storeKey("notes", chain.chainId, maspAddress, accountKey));
  const { wallet, fullSync } = await connectWallet({
    chain,
    nsk,
    account: accountKey,
    signer,
    denominations: true,
    storage: {
      notes,
      tree: new IdbTreePersistence(storeKey("tree", chain.chainId, maspAddress, accountKey)),
      nullifiers: new IdbNullifierPersistence(
        storeKey("nullifiers", chain.chainId, maspAddress, accountKey),
      ),
    },
  });

  if (fullSync === "unavailable") {
    log.error("FMD subscription unavailable; scanning every note in the pool");
    toast.warning("Private sync is degraded", {
      description: "The discovery service is unavailable, so syncing will be much slower.",
      duration: 10_000,
    });
  }

  holdNoteStore(wallet, notes);
  log.info("ready", wallet.address);
  return wallet;
}
