// A link's key is `wallet.claimLinkKey(index)`, recomputable from the sender's seed, so an
// unclaimed link can be found and swept back from any browser.
//
// One index funds at most one link: two links from one index share a key, and the holder of the
// first can take the second. Indices are taken in order, each only after its account is seen never
// to have held a note. The stored mark is a starting point, never trusted alone: another browser
// on the same seed may be ahead of it.

import type { WalletApi } from "@lelantos-org/sdk";
import { type ChainEntry, chainKey } from "@/config/chains";
import { releaseScanner } from "@/features/wallet";
import { type ChainLayerSpec, nskHexFromField } from "@/features/wallet-kinds";
import { createLogger } from "@/shared/lib/logger";
import { accountDigest } from "@/shared/lib/storage/digest";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore } from "@/shared/lib/storage/safe";
import { encodeClaimPayload } from "../link/codec";
import { claimLinksSnapshot, rememberClaimLink } from "../vault/store";
import {
  buildEphemeralWallet,
  clearEphemeralStore,
  EPHEMERAL_SCAN_PAGE,
  type EphemeralBalance,
  summarizeEphemeralNotes,
} from "./ephemeral-wallet";

/// Never log a link's key or URL: either is the bearer secret.
const log = createLogger("claim-links:seed");

/// What a link account holds now, or `undefined` when it has never held a note.
export type LinkHoldings = EphemeralBalance[] | undefined;

export type ProbeLink = (nskHex: string) => Promise<LinkHoldings>;

/// A probe over a throwaway wallet for the link's key, torn down before it returns.
export function linkProbe(layer: ChainLayerSpec, chain: ChainEntry): ProbeLink {
  return async (nskHex) => {
    const eph = await buildEphemeralWallet(nskHex, layer, chain);
    try {
      await eph.sync({ scope: "notes", pageSize: EPHEMERAL_SCAN_PAGE });
      // Spent notes count: a claimed link's key is still out there.
      const everHeld = (await eph.notes()).length > 0;
      return everHeld ? await summarizeEphemeralNotes(eph) : undefined;
    } finally {
      releaseScanner(eph);
      await clearEphemeralStore(chain.chainId, nskHex).catch((err) => {
        log.warn("clearing a probed link account failed", err);
      });
    }
  };
}

function markKey(sender: string, chainId: bigint): string {
  return `${LOCAL_KEYS.claimLinkNextPrefix}${chainKey(chainId)}:${accountDigest(sender)}`;
}

function nextHint(sender: string, chainId: bigint): number {
  const stored = Number(localStore.get(markKey(sender, chainId)));
  return Number.isSafeInteger(stored) && stored > 0 ? stored : 0;
}

function raiseHint(sender: string, chainId: bigint, next: number): void {
  if (next > nextHint(sender, chainId)) localStore.set(markKey(sender, chainId), String(next));
}

export interface AllocatedLink {
  index: number;
  nskHex: string;
  address: string;
}

async function linkAt(sender: WalletApi, index: number): Promise<AllocatedLink> {
  const key = await sender.claimLinkKey(index);
  return { index, nskHex: nskHexFromField(key.nsk), address: key.address };
}

/// The first index, at or after the stored mark, whose account has never held a note.
export async function allocateLink(
  sender: WalletApi,
  chainId: bigint,
  probe: ProbeLink,
): Promise<AllocatedLink> {
  for (let index = nextHint(sender.address, chainId); ; index++) {
    const link = await linkAt(sender, index);
    if ((await probe(link.nskHex)) === undefined) return link;
    raiseHint(sender.address, chainId, index + 1);
  }
}

/// Record that `index` now funds a link, so the next allocation starts past it.
export function markLinkFunded(sender: string, chainId: bigint, index: number): void {
  raiseHint(sender, chainId, index + 1);
}

export function claimUrl(origin: string, chainId: bigint, nskHex: string): string {
  return `${origin}/claim#${encodeClaimPayload(chainId, nskHex)}`;
}

export interface RecoveredLinks {
  /// Link accounts this seed has funded on the chain.
  funded: number;
  /// Those still holding funds.
  unclaimed: number;
  /// Records added to the vault; fewer than `unclaimed` when some were already there.
  restored: number;
}

/// Put every link this seed funded that still holds funds back in the vault, one record per asset
/// held. Walks the indices from zero to the first never-used account, so it finds links made in
/// any browser.
export async function recoverClaimLinks(
  sender: WalletApi,
  chainId: bigint,
  probe: ProbeLink,
  origin: string = window.location.origin,
): Promise<RecoveredLinks> {
  const out: RecoveredLinks = { funded: 0, unclaimed: 0, restored: 0 };
  for (let index = 0; ; index++) {
    const { nskHex } = await linkAt(sender, index);
    const holdings = await probe(nskHex);
    if (holdings === undefined) break;

    out.funded++;
    const held = holdings.filter((b) => b.amount > 0n);
    if (held.length === 0) continue;
    out.unclaimed++;

    const url = claimUrl(origin, chainId, nskHex);
    const known = new Set(
      claimLinksSnapshot()
        .filter((r) => r.url === url)
        .map((r) => r.assetId),
    );
    for (const balance of held) {
      if (known.has(balance.asset.toString())) continue;
      rememberClaimLink({
        url,
        chainId,
        assetId: balance.asset,
        amount: balance.amount,
        derived: true,
      });
      out.restored++;
    }
  }
  raiseHint(sender.address, chainId, out.funded);
  log.debug("recovered claim links", `chain=${chainId}`, out);
  return out;
}
