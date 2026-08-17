// TODO(v2): persist nsk_eph in localStorage keyed by claim_id for sender self-refund.
// TODO(v2): optional password-encrypted fragment (XChaCha20-Poly1305 + Argon2id).

import { connect, deriveKeysFromNsk, type TransferResult, type WalletApi } from "@lelantos-org/sdk";
import { type Field, randomFr } from "@lelantos-org/sdk/core";
import type { SpendPhase } from "@lelantos-org/sdk/wallet";
import { type ChainEntry, chainKey } from "@/config/chains";
import { env } from "@/config/env";
import {
  describeClaimError,
  encodeClaimPayload,
  nskFieldFromHex,
  nskHexFromField,
} from "@/features/claim-link/codec";
import { resolveSyncStrategy } from "@/features/wallet/fmd-subscription";
import { networkPreset } from "@/features/wallet/network-preset";
import { instrumentWallet } from "@/features/wallet/perf";
import { getProverWorker } from "@/features/wallet/prover/proverWorker";
import { createScanner } from "@/features/wallet/scanner";
import { IdbNoteStore } from "@/features/wallet/stores/noteStore";
import type { ConnectionBundle } from "@/features/wallet/use-connection";

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
}

export interface GenerateClaimLinkResult {
  url: string;
  /// Alias for `tx.txHash`.
  txHash: string;
  /// Full SDK transfer receipt (own commitments, inputSum/change).
  tx: TransferResult;
  nskEphHex: string;
  ephAddress: string;
}

export async function generateClaimLink(
  senderWallet: WalletApi,
  args: GenerateClaimLinkArgs,
): Promise<GenerateClaimLinkResult> {
  const nskEph = randomFr();
  const ephAddress = await deriveEphemeralAddress(nskEph);
  // `WalletApi.transfer` types the return as the union; transfer always
  // produces the TransferResult variant at runtime.
  const tx = (await senderWallet.transfer({
    to: ephAddress,
    amount: args.amount,
    asset: args.asset,
    autoConsolidate: true,
    onPhase: args.onPhase,
  })) as TransferResult;
  const nskEphHex = nskHexFromField(nskEph);
  const url = `${window.location.origin}/claim#${encodeClaimPayload(args.chainId, nskEphHex)}`;
  return { url, txHash: tx.txHash, tx, nskEphHex, ephAddress };
}

function ephNoteStoreKey(chainId: bigint, nskEphHex: string): string {
  return `notes:eph:${chainKey(chainId)}:${nskEphHex.slice(0, 16)}`;
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

export async function clearEphemeralStore(chainId: bigint, nskEphHex: string): Promise<void> {
  // IdbNoteStore writes into the shared `lelantos-wallet` DB under per-key entries;
  // overwrite ours with an empty file rather than deleting the DB so other wallets stay intact.
  const store = new IdbNoteStore(ephNoteStoreKey(chainId, nskEphHex));
  await store.save({ version: 2, notes: [] });
}
