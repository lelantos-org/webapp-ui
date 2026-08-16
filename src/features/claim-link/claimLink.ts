// TODO(v2): persist nsk_eph in localStorage keyed by claim_id for sender self-refund.
// TODO(v2): optional password-encrypted fragment (XChaCha20-Poly1305 + Argon2id).

import { connect, deriveKeysFromNsk, type TransferResult, type WalletApi } from "@lelantos-org/sdk";
import { type Field, randomFr } from "@lelantos-org/sdk/core";
import type { SpendPhase } from "@lelantos-org/sdk/wallet";
import { type ChainEntry, chainKey } from "@/config/chains";
import {
  describeClaimError,
  encodeClaimPayload,
  nskFieldFromHex,
  nskHexFromField,
} from "@/features/claim-link/codec";
import { networkPreset } from "@/features/wallet/network-preset";
import { instrumentWallet } from "@/features/wallet/perf";
import { getProverWorker } from "@/features/wallet/prover/proverWorker";
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

export async function buildEphemeralWallet(
  nskEphHex: string,
  bundle: ConnectionBundle,
  chain: ChainEntry,
): Promise<WalletApi> {
  const nsk = nskFieldFromHex(nskEphHex);
  if (!nsk.ok) throw new Error(describeClaimError(nsk.error));
  const w = await connect({
    network: await networkPreset(chain),
    nsk: nsk.value,
    provider: bundle.provider,
    address: bundle.address,
    rpcUrl: chain.rpcUrl,
    prover: getProverWorker(),
    noteStore: new IdbNoteStore(ephNoteStoreKey(chain.chainId, nskEphHex)),
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
