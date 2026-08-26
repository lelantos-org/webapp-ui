// Ephemeral bearer wallets behind claim links: generating a link, scanning its
// notes, sweeping them to a connected wallet, and clearing what the link leaves
// behind.

import { connect, deriveKeysFromNsk, type TransferResult, type WalletApi } from "@lelantos-org/sdk";
import { type Field, randomFr } from "@lelantos-org/sdk/core";
import type { SpendPhase } from "@lelantos-org/sdk/wallet";
import { type ChainEntry, chainKey } from "@/config/chains";
import { env } from "@/config/env";
import type { ConnectionBundle } from "@/features/wallet";
import {
  clearCachedSubscription,
  createScanner,
  getProverWorker,
  IdbNoteStore,
  instrumentWallet,
  networkPreset,
  resolveSyncStrategy,
} from "@/features/wallet";
import { storageDigest } from "@/shared/lib/storage-digest";
import { describeClaimError, encodeClaimPayload, nskFieldFromHex, nskHexFromField } from "./codec";
import { markClaimLinkBroadcast, rememberClaimLink } from "./link-vault";

async function deriveEphemeralAddress(nsk: Field): Promise<string> {
  const { address } = await deriveKeysFromNsk(nsk);
  return address;
}

export interface GenerateClaimLinkArgs {
  amount: bigint;
  asset?: bigint;
  /// Stamped into the link so the claimer knows which pool holds the notes.
  chainId: bigint;
  onPhase?: (phase: SpendPhase) => void;
  /// Last-moment check that the wallet is still on `chainId`.
  ///
  /// Read immediately before the transfer rather than at render: the caller's
  /// `useActiveChain()` is seconds stale by the time proving finishes, and a
  /// `chainChanged` in that window would stamp the link with one chain for a
  /// transfer that landed on another. The claimer would then scan the wrong pool
  /// and be told there is nothing to claim.
  currentChainId?: () => bigint | undefined;
}

export interface GenerateClaimLinkResult {
  url: string;
  /// Alias for `tx.txHash`.
  txHash: string;
  /// Full SDK transfer receipt: own commitments, `inputSum` and change.
  tx: TransferResult;
  nskEphHex: string;
  ephAddress: string;
  /// Correlation handle into `link-vault` for the record written before the
  /// broadcast. Dropping a record is `UnclaimedLinks`' responsibility, behind an
  /// explicit confirmation, so this is not a delete token.
  recordId: string;
}

export async function generateClaimLink(
  senderWallet: WalletApi,
  args: GenerateClaimLinkArgs,
): Promise<GenerateClaimLinkResult> {
  const nskEph = randomFr();
  const ephAddress = await deriveEphemeralAddress(nskEph);
  const nskEphHex = nskHexFromField(nskEph);
  const url = `${window.location.origin}/claim#${encodeClaimPayload(args.chainId, nskEphHex)}`;

  // Persisted before the broadcast: afterwards the only copy of this key would
  // be React state, which any chain or account switch discards once the funds
  // have moved. See `link-vault`.
  const recordId = rememberClaimLink({
    url,
    chainId: args.chainId,
    assetId: args.asset ?? 0n,
    amount: args.amount,
  });

  const stillHere = args.currentChainId?.();
  if (stillHere !== undefined && stillHere !== args.chainId) {
    throw new Error(
      `wallet switched to chain ${stillHere} while preparing a link for chain ${args.chainId}`,
    );
  }

  // `WalletApi.transfer` types the return as the union, but always produces the
  // `TransferResult` variant at runtime.
  const tx = (await senderWallet.transfer({
    to: ephAddress,
    amount: args.amount,
    asset: args.asset,
    autoConsolidate: true,
    onPhase: args.onPhase,
  })) as TransferResult;

  markClaimLinkBroadcast(recordId, tx.txHash);
  return { url, txHash: tx.txHash, tx, nskEphHex, ephAddress, recordId };
}

/// Namespace for one link's ephemeral note store.
///
/// The suffix is a digest of the bearer key, never the key itself. Writing key
/// bytes into an IndexedDB record name would persist the value this page is
/// designed to keep out of storage (see `scrubLocationHash`), and would surface
/// it on screen, since `describeError` passes short raw messages through and an
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
  bundle: ConnectionBundle,
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
  // Namespaced under the ephemeral address rather than the connected EOA, so the
  // token cache entry is separate from the main wallet's.
  const ephAddress = await deriveEphemeralAddress(nsk.value);
  const plan = await resolveSyncStrategy(env.fmdUrl, chain.chainId, nsk.value, ephAddress);

  const w = await connect({
    network: await networkPreset(chain),
    nsk: nsk.value,
    provider: bundle.provider,
    address: bundle.address,
    rpcUrl: chain.rpcUrl,
    prover: getProverWorker(),
    noteStore: new IdbNoteStore(ephNoteStoreKey(chain.chainId, nskEphHex)),
    // Below the wallet default: this scans a small window for a single note on a
    // short-lived page.
    scanner: createScanner(2),
    syncStrategy: plan.strategy,
  });
  instrumentWallet(w);
  return w;
}

export interface EphemeralBalance {
  asset: bigint;
  amount: bigint;
  notes: number;
}

export function summarizeEphemeralNotes(eph: WalletApi): EphemeralBalance[] {
  const byAsset = new Map<bigint, { amount: bigint; notes: number }>();
  for (const n of eph.notes({ spent: false })) {
    const cur = byAsset.get(n.asset) ?? { amount: 0n, notes: 0 };
    cur.amount += n.value;
    cur.notes += 1;
    byAsset.set(n.asset, cur);
  }
  return [...byAsset.entries()]
    .map(([asset, x]) => ({ asset, ...x }))
    .sort((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0));
}

export async function sweepEphemeral(
  eph: WalletApi,
  destAddress: string,
  asset: bigint,
): Promise<string> {
  const balances = summarizeEphemeralNotes(eph);
  const row = balances.find((b) => b.asset === asset);
  if (!row || row.amount === 0n) throw new Error("nothing to claim");
  const { txHash } = await eph.transfer({
    to: destAddress,
    amount: row.amount,
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
  // `IdbNoteStore` writes into the shared `lelantos-wallet` DB under per-key
  // entries, so removing this one leaves every other wallet intact.
  const store = new IdbNoteStore(ephNoteStoreKey(chainId, nskEphHex));
  await store.destroy();
}
