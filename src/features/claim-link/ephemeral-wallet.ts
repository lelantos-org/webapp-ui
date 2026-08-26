// TODO(v2): optional password-encrypted fragment (XChaCha20-Poly1305 + Argon2id).

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
  /// `chainChanged` in that window produced a link stamped with chain A for a
  /// transfer that landed on chain B — the exact mismatch `codec.ts` says the
  /// chain field exists to prevent, where the claimer scans the wrong pool and
  /// is told "nothing to claim".
  currentChainId?: () => bigint | undefined;
}

export interface GenerateClaimLinkResult {
  url: string;
  /// Alias for `tx.txHash`.
  txHash: string;
  /// Full SDK transfer receipt (own commitments, inputSum/change).
  tx: TransferResult;
  nskEphHex: string;
  ephAddress: string;
  /// Handle into `link-vault` for the record written before the broadcast.
  ///
  /// The sender-side form no longer forgets it on reset — dropping a record is
  /// `UnclaimedLinks`' job, behind an explicit confirmation — so this is the
  /// correlation handle, not a delete token.
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

  // Persisted *before* the broadcast. After it, the only copy of this key was
  // React state that any chain or account switch discards — and the funds are
  // already gone by then. See `link-vault`.
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

  // `WalletApi.transfer` types the return as the union; transfer always
  // produces the TransferResult variant at runtime.
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
/// The suffix is a digest of the bearer key, never the key itself. This used to
/// be `nskEphHex.slice(0, 16)` — 8 bytes of the spending key written verbatim
/// as an IndexedDB record name, on a page whose entire design (see
/// `scrubLocationHash`) is about keeping that value out of persistence. It also
/// leaked onto the screen: `describeError` passes short raw messages straight
/// through, so an idb failure naming the store rendered the fragment in the
/// error card.
///
/// Shares `storageDigest` with the per-account keys, so the two namespaces
/// cannot drift into disagreeing about what a digest is.
function ephNoteStoreKey(chainId: bigint, nskEphHex: string): string {
  return `notes:eph:${chainKey(chainId)}:${storageDigest(nskEphHex)}`;
}

/// Read the link's notes with a throwaway wallet built from its bearer key.
///
/// Carries no `treePersistence` or `nullifierPersistence`: the wallet exists
/// for one sweep, and persisting its tree would write a second copy of the feed
/// into IndexedDB under a key never read again. The feed is therefore re-walked
/// on each visit, which is what the scanner and sync strategy below address.
///
/// Callers own the returned wallet and must pass it to `releaseScanner`.
export async function buildEphemeralWallet(
  nskEphHex: string,
  bundle: ConnectionBundle,
  chain: ChainEntry,
): Promise<WalletApi> {
  const nsk = nskFieldFromHex(nskEphHex);
  if (!nsk.ok) throw new Error(describeClaimError(nsk.error));

  // Both arguments are required to keep the scan off the main thread. Without
  // a strategy `connect` defaults to `{ kind: "full" }`, trial-decrypting every
  // note in the pool, and without a `scanner` it defaults to the inline
  // `LocalScanner`, which runs that work on the calling thread.
  //
  // Subscribing discloses to the discovery service that a detection key is
  // watching this ephemeral address — the same trade the main wallet makes.
  // `resolveSyncStrategy` declines to subscribe on a pool below the decoy
  // floor, where the full scan is cheap and disclosing nothing is more private.
  //
  // Namespaced under the ephemeral address rather than the connected EOA, so
  // the token cache entry is separate from the main wallet's.
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
    // Below the wallet default: this scans a small window for a single note,
    // on a short-lived page.
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
/// Deletes the record rather than blanking it. Overwriting with an empty file
/// left the key in place indefinitely; the store is a cache of one spent link
/// and there is nothing to keep. The FMD subscription token registered for the
/// ephemeral address goes too — a one-shot link should not leave a permanent
/// entry tying that address to this browser.
export async function clearEphemeralStore(chainId: bigint, nskEphHex: string): Promise<void> {
  const nsk = nskFieldFromHex(nskEphHex);
  if (nsk.ok) clearCachedSubscription(chainId, await deriveEphemeralAddress(nsk.value));
  // IdbNoteStore writes into the shared `lelantos-wallet` DB under per-key
  // entries, so removing ours leaves every other wallet intact.
  const store = new IdbNoteStore(ephNoteStoreKey(chainId, nskEphHex));
  await store.destroy();
}
