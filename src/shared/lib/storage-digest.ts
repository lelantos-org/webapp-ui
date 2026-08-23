import { sha256, stringToHex } from "viem";

/// Hex characters of digest kept in a key name (8 bytes).
///
/// 2^64 of namespace is far past collision range for the handful of accounts
/// or links one browser profile ever sees, and short enough that a key stays
/// readable in a devtools pane.
const DIGEST_CHARS = 16;

/// Short, stable, non-reversible stand-in for `value` in a storage key *name*.
///
/// Synchronous on purpose. `getCachedNsk` is called during render
/// (`use-build-wallet.ts`), and `crypto.subtle` is async-only — hence viem's
/// `sha256` rather than WebCrypto. The two agree byte for byte, so records
/// written by either spelling land in the same namespace.
export function storageDigest(value: string): string {
  return sha256(stringToHex(value)).slice(2, 2 + DIGEST_CHARS);
}

/// [`storageDigest`] of an EOA, for the storage keys scoped to one account.
///
/// `lelantos:nsk:<eoa>`, `lelantos:fmd-sub:v2:<chain>:<eoa>` and the IndexedDB
/// record names used to carry the address verbatim, so anything that could
/// enumerate keys — an extension holding `storage` read scope, a profile
/// directory copied off a disk, a devtools pane read over a shoulder — learned
/// which accounts this browser had connected without parsing a single value.
///
/// Be clear about what this does and does not buy. It stops enumeration, not
/// lookup: an adversary holding a candidate address can digest it and check for
/// the key, and the *values* behind these keys remain plaintext, so anything
/// that can read them learns the account anyway. It raises the cost of a
/// scan-for-anything, and nothing more.
///
/// Lowercases first: callers pass whatever casing the wallet handed them —
/// EIP-55 checksummed from one provider, lowercase from another — and a digest
/// that disagreed across those would strand a cached nsk behind a silent
/// re-prompt.
export function accountDigest(ethAddr: string): string {
  return storageDigest(ethAddr.toLowerCase());
}
