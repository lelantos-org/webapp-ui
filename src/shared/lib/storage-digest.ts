import { sha256, stringToHex } from "viem";

/// Hex characters of digest kept in a key name (8 bytes).
///
/// A 2^64 namespace is well beyond collision range for the number of accounts or
/// links one browser profile sees, and short enough to keep a key readable in a
/// devtools pane.
const DIGEST_CHARS = 16;

/// Short, stable, non-reversible stand-in for `value` in a storage key name.
///
/// Synchronous, because `getCachedNsk` is called during render
/// (`use-build-wallet.ts`) and `crypto.subtle` is async-only; hence viem's
/// `sha256` rather than WebCrypto. The two agree byte for byte, so records
/// written by either land in the same namespace.
export function storageDigest(value: string): string {
  return sha256(stringToHex(value)).slice(2, 2 + DIGEST_CHARS);
}

/// [`storageDigest`] of an EVM address, for the storage keys scoped by one.
///
/// Named for its main use — the connected account — but the rule it encodes
/// (lowercase, then digest) is the one every address in a key name needs, so
/// the pool address that namespaces a deployment goes through it too.
///
/// Keeps the address out of key names such as `lelantos:nsk:<eoa>`,
/// `lelantos:fmd-sub:v3:<chain>:<eoa>` and the IndexedDB record names, so
/// anything able to enumerate keys — an extension with `storage` read scope, a
/// copied profile directory, a devtools pane — cannot list the accounts this
/// browser has connected.
///
/// This stops enumeration, not lookup: an adversary holding a candidate address
/// can digest it and check for the key, and the values behind these keys remain
/// plaintext.
///
/// Lowercased first, because callers pass whatever casing the source supplied —
/// EIP-55 checksummed from one provider, lowercase from another — and a digest
/// differing across those would strand a cached nsk behind a silent re-prompt,
/// or a synced Merkle tree behind a silent cold resync.
export function accountDigest(address: string): string {
  return storageDigest(address.toLowerCase());
}
