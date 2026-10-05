import { chainKey } from "@/config/chains";
import { env, overriddenEndpoints } from "@/config/env";
import { accountDigest, storageDigest } from "@/shared/lib/storage/digest";

// Key prefix for stores that follow one note feed: a note cursor and a nullifier count mean
// nothing to another server. Empty on the build's own feed, whose keys must never change.
function feedScope(): string {
  return overriddenEndpoints().includes("fmdUrl") ? `ep:${storageDigest(env.fmdUrl)}:` : "";
}

/// Where one account's `kind` store lives. Keyed by MASP address too: a redeploy under the same
/// chain id must not reuse a stale tree. The tree is the chain's own and is checked against the
/// pool's roots, so every feed shares it.
export function walletStoreKey(
  kind: "notes" | "tree" | "nullifiers",
  chainId: bigint,
  maspAddress: string,
  accountKey: string,
): string {
  const scope = kind === "tree" ? "" : feedScope();
  return `${scope}${kind}:${chainKey(chainId)}:${accountDigest(maspAddress)}:${accountDigest(accountKey)}`;
}

const linkNotes = (scope: string, chainId: bigint, linkDigest: string) =>
  `${scope}notes:eph:${chainKey(chainId)}:${linkDigest}`;

/// Where a claim link's notes live under the feed in use. `linkDigest` stands in for its key.
export function linkNoteStoreKey(chainId: bigint, linkDigest: string): string {
  return linkNotes(feedScope(), chainId, linkDigest);
}

/// Every key this tab can have put the link's notes under: the build's feed and the one in use.
export function linkNoteStoreKeys(chainId: bigint, linkDigest: string): string[] {
  return [...new Set(["", feedScope()])].map((scope) => linkNotes(scope, chainId, linkDigest));
}
