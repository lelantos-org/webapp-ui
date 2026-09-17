import { sha256, stringToHex } from "viem";

/// Hex characters of digest kept in a key name (8 bytes).
const DIGEST_CHARS = 16;

/// Short, stable, non-reversible stand-in for `value` in a storage key name. Synchronous.
export function storageDigest(value: string): string {
  return sha256(stringToHex(value)).slice(2, 2 + DIGEST_CHARS);
}

/// [`storageDigest`] of a lowercased address, so key names do not enumerate accounts.
export function accountDigest(address: string): string {
  return storageDigest(address.toLowerCase());
}
