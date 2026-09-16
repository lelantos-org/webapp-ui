// Which passkey to reattach to, in `localStorage`.
//
// Two keys with opposite lifetimes, as in `eip1193/rdns-storage.ts`: the
// *attachment* is a session latch released by `disconnect`; the *credential* is
// the wallet's identity and outlives the session. Collapsing them destroys a
// wallet — `nsk` comes from one credential's PRF output, so dropping the id on
// sign-out makes `attachOrEnrol` enrol a second credential under a different
// key, stranding the first with nothing having failed.
//
// The id is not a secret: it rides in `allowCredentials` on every assertion and
// authorises nothing alone.

import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore, readJson, writeJson } from "@/shared/lib/storage/safe";

/// The credential this device knows. Survives a disconnect.
const CREDENTIAL_KEY = LOCAL_KEYS.passkeyCredential;
/// Whether that credential currently holds the session. Released on disconnect.
const ATTACHED_KEY = LOCAL_KEYS.passkeyAttached;
const CHAIN_KEY = LOCAL_KEYS.passkeyChain;

export interface StoredCredential {
  id: string;
  label?: string;
  createdAt?: number;
}

function isStoredCredential(v: unknown): v is StoredCredential {
  return typeof v === "object" && v !== null && typeof (v as StoredCredential).id === "string";
}

/// The credential this device has enrolled, attached or not. Decides which
/// passkey to attach, and the picker's "Passkey" vs "Create a passkey" label.
export function storedCredential(): StoredCredential | undefined {
  return readJson(localStore, CREDENTIAL_KEY, isStoredCredential);
}

/// Record a newly enrolled credential and attach to it.
export function rememberCredential(cred: StoredCredential): void {
  writeJson(localStore, CREDENTIAL_KEY, cred);
  markAttached();
}

/// Whether a boot should restore the passkey session.
export function isAttached(): boolean {
  return localStore.get(ATTACHED_KEY) === "1";
}

export function markAttached(): void {
  localStore.set(ATTACHED_KEY, "1");
}

/// Sign out, keeping the credential. Deleting that is the platform's job, and
/// doing it here would strand every note the derived key owns.
export function releaseAttachment(): void {
  localStore.set(ATTACHED_KEY, "0");
}

/// The chain a passkey session last selected.
///
/// Persisted because it is a user choice with no other home: an injected wallet
/// carries its own network, and a passkey has none to read.
export function storedChainId(): bigint | undefined {
  const raw = localStore.get(CHAIN_KEY);
  if (raw === undefined) return undefined;
  try {
    return BigInt(raw);
  } catch {
    localStore.remove(CHAIN_KEY);
    return undefined;
  }
}

export function rememberChainId(chainId: bigint): void {
  localStore.set(CHAIN_KEY, chainId.toString());
}

/// The `accountKey` a passkey session is identified by: the nsk cache, the
/// note/tree/nullifier namespaces, the build pool. Namespaced so a credential
/// cannot collide with an EOA.
///
/// One definition, because `passkeyStore.connect` seeds the nsk cache under it
/// and `passkeyKind.useSnapshot` publishes it — two spellings would not fail,
/// they would silently miss.
export function passkeyAccountKey(credentialId: string): string {
  return `passkey:${credentialId}`;
}
