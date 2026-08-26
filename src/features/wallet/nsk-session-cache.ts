import type { Field } from "@lelantos-org/sdk/crypto";
import { createLogger } from "@/shared/lib/logger";
import { sessionStore } from "@/shared/lib/storage";
import { accountDigest } from "@/shared/lib/storage-digest";
import { nskFieldFromHex, nskHexFromField } from "./nsk-codec";

const log = createLogger("nsk-cache");
/// Versioned by key shape. Entries live in `sessionStorage`, so a bump leaves any
/// older ones to expire with the tab and a miss costs one EIP-712 prompt.
const PREFIX = "lelantos:nsk:v2:";

/// Not chain-scoped.
///
/// `LELANTOS_NSK_DOMAIN` omits chainId, so one EIP-712 signature yields the same
/// nsk — and the same shielded address — on every chain. Keying by chain would
/// make a chain switch re-prompt for a signature whose result is identical.
///
/// The address is digested rather than written out; see `accountDigest`.
function key(ethAddr: string): string {
  return `${PREFIX}${accountDigest(ethAddr)}`;
}

/// Read the cached nsk for `ethAddr`. Returns `undefined` on a miss, a malformed
/// entry, or unavailable storage.
export function getCachedNsk(ethAddr: string): Field | undefined {
  const raw = sessionStore.get(key(ethAddr));
  if (raw === undefined) {
    log.debug("miss");
    return undefined;
  }
  const parsed = nskFieldFromHex(raw);
  if (!parsed.ok) {
    log.warn("malformed cache entry; clearing", parsed.error);
    clearCachedNsk(ethAddr);
    return undefined;
  }
  log.debug("hit");
  return parsed.value;
}

/// Persist `nsk` for `ethAddr`. Best-effort: a storage failure costs one extra
/// EIP-712 prompt later rather than failing the wallet build.
export function cacheNsk(ethAddr: string, nsk: Field): void {
  if (sessionStore.set(key(ethAddr), nskHexFromField(nsk))) log.debug("stored");
}

export function clearCachedNsk(ethAddr: string): void {
  sessionStore.remove(key(ethAddr));
}

/// Clear every cached nsk in this tab.
///
/// Not only the connected address: a session that touched several accounts holds
/// one raw spending key per account, and a disconnect must revoke all of them.
export function clearAllCachedNsk(): void {
  sessionStore.removePrefix(PREFIX);
}
