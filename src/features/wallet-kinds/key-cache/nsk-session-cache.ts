import type { Field } from "@lelantos-org/sdk/primitives";
import { createLogger } from "@/shared/lib/logger";
import { accountDigest } from "@/shared/lib/storage/digest";
import { SESSION_KEYS } from "@/shared/lib/storage/keys";
import { sessionStore } from "@/shared/lib/storage/safe";
import { nskFieldFromHex, nskHexFromField } from "./nsk-codec";

const log = createLogger("nsk-cache");
/// Versioned by key shape. Entries live in `sessionStorage`, so a bump leaves any
/// other ones to expire with the tab and a miss costs one key-derivation prompt.
///
/// Keyed by an opaque account key rather than an EOA, since a passkey session
/// has no EOA and identifies itself by credential id instead.
const PREFIX = SESSION_KEYS.nskPrefix;

/// Not chain-scoped.
///
/// `LELANTOS_NSK_DOMAIN` omits chainId, so one EIP-712 signature yields the same
/// nsk — and the same shielded address — on every chain. The passkey path is
/// chain-independent for the same reason: `LELANTOS_PRF_SALT` names no chain
/// either. Keying by chain would make a chain switch re-prompt for a
/// derivation whose result is identical.
///
/// `accountKey` is whatever identifies the account to the wallet kind in play:
/// the EOA for an injected wallet, the credential id for a passkey. It is
/// digested rather than written out; see `accountDigest`.
function key(accountKey: string): string {
  return `${PREFIX}${accountDigest(accountKey)}`;
}

/// Read the cached nsk for `accountKey`. Returns `undefined` on a miss, a
/// malformed entry, or unavailable storage.
export function getCachedNsk(accountKey: string): Field | undefined {
  const raw = sessionStore.get(key(accountKey));
  if (raw === undefined) {
    log.debug("miss");
    return undefined;
  }
  const parsed = nskFieldFromHex(raw);
  if (!parsed.ok) {
    log.warn("malformed cache entry; clearing", parsed.error);
    clearCachedNsk(accountKey);
    return undefined;
  }
  log.debug("hit");
  return parsed.value;
}

/// Persist `nsk` for `accountKey`. Best-effort: a storage failure costs one
/// extra derivation prompt later rather than failing the wallet build.
export function cacheNsk(accountKey: string, nsk: Field): void {
  if (sessionStore.set(key(accountKey), nskHexFromField(nsk))) log.debug("stored");
}

export function clearCachedNsk(accountKey: string): void {
  sessionStore.remove(key(accountKey));
}

/// Clear every cached nsk in this tab.
///
/// Not only the connected account: a session that touched several accounts
/// holds one raw spending key per account, and a disconnect must revoke all of
/// them. Kind-agnostic, so one call clears both an EOA's entries and a
/// passkey's.
export function clearAllCachedNsk(): void {
  sessionStore.removePrefix(PREFIX);
}
