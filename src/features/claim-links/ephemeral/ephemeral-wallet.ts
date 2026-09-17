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

/// Namespace for one link's note store: a digest of the bearer key, never the key itself.
function ephNoteStoreKey(chainId: bigint, nskEphHex: string): string {
  return `notes:eph:${chainKey(chainId)}:${storageDigest(nskEphHex)}`;
}

/// A throwaway wallet over the link's notes; it persists no tree. Callers must `releaseScanner` it.
export async function buildEphemeralWallet(
  nskEphHex: string,
  layer: ChainLayerSpec,
  chain: ChainEntry,
): Promise<WalletApi> {
  const nsk = nskFieldFromHex(nskEphHex);
  if (!nsk.ok) throw new Error(describeClaimError(nsk.error));

  // Strategy and scanner are both required, or `connect` scans the whole pool on the main thread.
  const ephAddress = await deriveEphemeralAddress(nsk.value);
  const plan = await resolveSyncStrategy(env.fmdUrl, chain.chainId, nsk.value, ephAddress);

  // Borrow only the session's signer: `derive` is never called, so no key prompt is raised.
  const { signer } = kindAdapter(layer.kind).keySource(layer, chain);
  const chainLayer = signer ? { signer } : { readOnly: true as const };

  // Created outside `connect` so a failed build still frees it.
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

/// The link's unspent notes per asset, in asset order.
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
    amount: circuitAmount(row.amount),
    asset,
    autoConsolidate: true,
  });
  return txHash;
}

/// Drop the link's note store and FMD subscription so nothing ties the link to this browser.
export async function clearEphemeralStore(chainId: bigint, nskEphHex: string): Promise<void> {
  const nsk = nskFieldFromHex(nskEphHex);
  if (nsk.ok) clearCachedSubscription(chainId, await deriveEphemeralAddress(nsk.value));
  const store = new IdbNoteStore(ephNoteStoreKey(chainId, nskEphHex));
  await store.destroy();
}
