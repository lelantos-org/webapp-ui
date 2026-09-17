import type { Field } from "@lelantos-org/sdk/primitives";
import { createLogger } from "@/shared/lib/logger";
import { accountDigest } from "@/shared/lib/storage/digest";
import { SESSION_KEYS } from "@/shared/lib/storage/keys";
import { sessionStore } from "@/shared/lib/storage/safe";
import { nskFieldFromHex, nskHexFromField } from "./nsk-codec";

const log = createLogger("nsk-cache");
const PREFIX = SESSION_KEYS.nskPrefix;

/// Not chain-scoped (the nsk is chain-independent); the account key is digested, never written out.
function key(accountKey: string): string {
  return `${PREFIX}${accountDigest(accountKey)}`;
}

/// The cached nsk for `accountKey`, or `undefined` on a miss, bad entry or no storage.
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

/// Persist `nsk` for `accountKey`. Best-effort.
export function cacheNsk(accountKey: string, nsk: Field): void {
  if (sessionStore.set(key(accountKey), nskHexFromField(nsk))) log.debug("stored");
}

export function clearCachedNsk(accountKey: string): void {
  sessionStore.remove(key(accountKey));
}

/// Clear every cached nsk in this tab: disconnect must revoke every raw spending key, not just the active one.
export function clearAllCachedNsk(): void {
  sessionStore.removePrefix(PREFIX);
}
