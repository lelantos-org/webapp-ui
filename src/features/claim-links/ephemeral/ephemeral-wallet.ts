// Ephemeral bearer wallets behind claim links: scanning a link's notes, sweeping
// them to a connected wallet, and clearing what the link leaves behind.
// Generating one is `generate.ts`.

import { circuitAmount, connect, type WalletApi } from "@lelantos-org/sdk";
import { deriveKeysFromNsk, type Field } from "@lelantos-org/sdk/primitives";
import { type ChainEntry, chainKey } from "@/config/chains";
import { env } from "@/config/env";
import {
  clearCachedSubscription,
  computeBalances,
  createScanner,
  heldNotes,
  holdScanner,
  IdbNoteStore,
  instrumentWallet,
  networkPreset,
  resolveSyncStrategy,
  sharedProver,
} from "@/features/wallet";
import { type ChainLayerSpec, kindAdapter, nskFieldFromHex } from "@/features/wallet-kinds";
import { storageDigest } from "@/shared/lib/storage/digest";
import { describeClaimError } from "../link/codec";

export async function deriveEphemeralAddress(nsk: Field): Promise<string> {
  const { address } = await deriveKeysFromNsk(nsk);
  return address;
}

/// Namespace for one link's ephemeral note store.
///
/// The suffix is a digest of the bearer key, never the key itself. Writing key
/// bytes into an IndexedDB record name would persist the value this page is
/// designed to keep out of storage (see `scrubLocationHash`), and would surface
/// it on screen, since `userMessage` passes short raw messages through and an
/// idb failure names the store.
///
/// Shares `storageDigest` with the per-account keys, so both namespaces agree on
/// what a digest is.
function ephNoteStoreKey(chainId: bigint, nskEphHex: string): string {
  return `notes:eph:${chainKey(chainId)}:${storageDigest(nskEphHex)}`;
}

/// Read the link's notes with a throwaway wallet built from its bearer key.
///
/// Carries no `treePersistence` or `nullifierPersistence`: the wallet exists for
/// one sweep, and persisting its tree would write a second copy of the feed into
/// IndexedDB under a key never read again. The feed is re-walked on each visit,
/// which the scanner and sync strategy below account for.
///
/// Callers own the returned wallet and must pass it to `releaseScanner`.
export async function buildEphemeralWallet(
  nskEphHex: string,
  layer: ChainLayerSpec,
  chain: ChainEntry,
): Promise<WalletApi> {
  const nsk = nskFieldFromHex(nskEphHex);
  if (!nsk.ok) throw new Error(describeClaimError(nsk.error));

  // Both arguments are required to keep the scan off the main thread. Without a
  // strategy `connect` defaults to `{ kind: "full" }`, trial-decrypting every
  // note in the pool; without a `scanner` it defaults to the inline
  // `LocalScanner`, which runs that work on the calling thread.
  //
  // Subscribing discloses to the discovery service that a detection key watches
  // this ephemeral address, the same trade the main wallet makes.
  // `resolveSyncStrategy` declines to subscribe on a pool below the decoy floor,
  // where the full scan is cheap and disclosing nothing is more private.
  //
  // Namespaced under the ephemeral address rather than the connected account, so
  // the token cache entry is separate from the main wallet's.
  const ephAddress = await deriveEphemeralAddress(nsk.value);
  const plan = await resolveSyncStrategy(env.fmdUrl, chain.chainId, nsk.value, ephAddress);

  // The key here is the link's, not the session's — but the *chain layer* is
  // still the session's, and a kind with no signer has none to lend. Sweeping
  // is a transfer, so a read-only layer is all it needs.
  //
  // `keySource` is asked only for its signer; `derive` is never called, so no
  // prompt is raised for a key this wallet will not use.
  const { signer } = kindAdapter(layer.kind).keySource(layer, chain);
  const chainLayer = signer ? { signer } : { readOnly: true as const };

  // Below the wallet default: this scans a small window for a single note on a
  // short-lived page. Held outside `connect` so a failed build still frees it.
  const scanner = createScanner(2);
  let w: WalletApi;
  try {
    w = await connect({
      network: networkPreset(chain),
      rpcUrl: chain.readRpcUrl,
      nsk: nsk.value,
      ...chainLayer,
      prover: sharedProver(),
      storage: { notes: new IdbNoteStore(ephNoteStoreKey(chain.chainId, nskEphHex)) },
      scanner,
      syncStrategy: plan.strategy,
    });
  } catch (e) {
    await scanner.dispose();
    throw e;
  }
  holdScanner(w, scanner);
  instrumentWallet(w);
  return w;
}

export interface EphemeralBalance {
  asset: bigint;
  amount: bigint;
  notes: number;
}

/// The link's unspent notes per asset, in asset order: the wallet's own fold,
/// with the total named `amount`.
export async function summarizeEphemeralNotes(eph: WalletApi): Promise<EphemeralBalance[]> {
  const notes = heldNotes(await eph.notes({ spent: false }));
  return computeBalances(notes).map(({ asset, balance, notes }) => ({
    asset,
    amount: balance,
    notes,
  }));
}

export async function sweepEphemeral(
  eph: WalletApi,
  destAddress: string,
  asset: bigint,
): Promise<string> {
  const balances = await summarizeEphemeralNotes(eph);
  const row = balances.find((b) => b.asset === asset);
  if (!row || row.amount === 0n) throw new Error("nothing to claim");
  const { txHash } = await eph.transfer({
    recipient: destAddress,
    // A sum of note values the wallet decrypted: circuit units.
    amount: circuitAmount(row.amount),
    asset,
    autoConsolidate: true,
  });
  return txHash;
}

/// Drop everything this link left behind once it has been swept.
///
/// Deletes the record rather than blanking it: the store caches one spent link
/// and nothing in it is worth keeping. The FMD subscription token registered for
/// the ephemeral address is dropped too, so a one-shot link leaves no permanent
/// entry tying that address to this browser.
export async function clearEphemeralStore(chainId: bigint, nskEphHex: string): Promise<void> {
  const nsk = nskFieldFromHex(nskEphHex);
  if (nsk.ok) clearCachedSubscription(chainId, await deriveEphemeralAddress(nsk.value));
  // `IdbNoteStore` writes into the shared `lelantos` DB under per-key
  // entries, so removing this one leaves every other wallet intact.
  const store = new IdbNoteStore(ephNoteStoreKey(chainId, nskEphHex));
  await store.destroy();
}
