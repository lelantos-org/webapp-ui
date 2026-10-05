import { circuitAmount, type SpendPhase, type WalletApi } from "@lelantos-org/sdk";
import { deriveKeysFromNsk, type Field } from "@lelantos-org/sdk/primitives";
import type { ChainEntry } from "@/config/chains";
import {
  clearCachedSubscription,
  computeBalances,
  connectWallet,
  heldNotes,
  IdbNoteStore,
  linkNoteStoreKey,
  linkNoteStoreKeys,
} from "@/features/wallet";
import { type ChainLayerSpec, kindAdapter, nskFieldFromHex } from "@/features/wallet-kinds";
import { storageDigest } from "@/shared/lib/storage/digest";
import { describeClaimError } from "../link/codec";

export async function deriveEphemeralAddress(nsk: Field): Promise<string> {
  const { address } = await deriveKeysFromNsk(nsk);
  return address;
}

/// A throwaway wallet over the link's notes; it persists no tree. Callers must `releaseScanner` it.
///
/// `layer` lends the session's signer. Without one the wallet is read-only, which reading and
/// sweeping its notes do not need: both go through the relayer.
export async function buildEphemeralWallet(
  nskEphHex: string,
  layer: ChainLayerSpec | undefined,
  chain: ChainEntry,
): Promise<WalletApi> {
  const nsk = nskFieldFromHex(nskEphHex);
  if (!nsk.ok) throw new Error(describeClaimError(nsk.error));

  const { wallet } = await connectWallet({
    chain,
    nsk: nsk.value,
    account: await deriveEphemeralAddress(nsk.value),
    // Borrow only the signer: `derive` is never called, so no key prompt is raised.
    signer: layer ? kindAdapter(layer.kind).keySource(layer, chain).signer : undefined,
    // Keyed by a digest of the bearer key, never the key itself.
    storage: {
      notes: new IdbNoteStore(linkNoteStoreKey(chain.chainId, storageDigest(nskEphHex))),
    },
    scannerSize: 2,
  });
  return wallet;
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

/// Notes fetched per page when scanning an ephemeral wallet.
export const EPHEMERAL_SCAN_PAGE = 500;

/// Sync the wallet's notes, then `summarizeEphemeralNotes`.
export async function scanEphemeralBalances(eph: WalletApi): Promise<EphemeralBalance[]> {
  await eph.sync({ scope: "notes", pageSize: EPHEMERAL_SCAN_PAGE });
  return summarizeEphemeralNotes(eph);
}

export async function sweepEphemeral(
  eph: WalletApi,
  destAddress: string,
  asset: bigint,
  onPhase?: (phase: SpendPhase) => void,
): Promise<string> {
  const balances = await summarizeEphemeralNotes(eph);
  const row = balances.find((b) => b.asset === asset);
  if (!row || row.amount === 0n) throw new Error("nothing to claim");
  const { txHash } = await eph.transfer({
    recipient: destAddress,
    amount: circuitAmount(row.amount),
    asset,
    autoConsolidate: true,
    onPhase,
  });
  return txHash;
}

/// Drop the link's note store and FMD subscription so nothing ties the link to this browser.
export async function clearEphemeralStore(chainId: bigint, nskEphHex: string): Promise<void> {
  const nsk = nskFieldFromHex(nskEphHex);
  if (nsk.ok) clearCachedSubscription(chainId, await deriveEphemeralAddress(nsk.value));
  await Promise.all(
    linkNoteStoreKeys(chainId, storageDigest(nskEphHex)).map((key) =>
      new IdbNoteStore(key).destroy(),
    ),
  );
}
