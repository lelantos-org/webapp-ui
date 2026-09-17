// Passkey storage. The credential outlives disconnect: dropping it re-enrols a new nsk and strands funds.

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

/// The credential this device has enrolled, attached or not.
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

/// Sign out, keeping the credential: deleting it would strand every note its key owns.
export function releaseAttachment(): void {
  localStore.set(ATTACHED_KEY, "0");
}

/// The chain a passkey session last selected.
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

/// The `accountKey` of a passkey session. Single spelling shared by the nsk cache seed and snapshot.
export function passkeyAccountKey(credentialId: string): string {
  return `passkey:${credentialId}`;
}
