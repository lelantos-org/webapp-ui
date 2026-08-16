import type { Field } from "@lelantos-org/sdk/crypto";
import { nskFieldFromHex, nskHexFromField } from "@/features/wallet/nsk-codec";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("nsk-cache");
const PREFIX = "lelantos:nsk:";

/// Deliberately NOT chain-scoped.
///
/// `LELANTOS_NSK_DOMAIN` omits chainId on purpose, so one EIP-712 signature
/// yields the same nsk (and the same shielded address) on every chain. Keying
/// this by chain would only make a chain switch re-prompt for a signature
/// whose result is known to be identical.
function key(ethAddr: string): string {
  return `${PREFIX}${ethAddr.toLowerCase()}`;
}

function store(): Storage | undefined {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    // Some browsers throw on `sessionStorage` access in privacy/sandboxed
    // contexts; treat as absent.
    return undefined;
  }
}

/// Read the cached nsk for `ethAddr` from sessionStorage.
/// Returns `undefined` on miss, malformed entry, or unavailable storage.
export function getCachedNsk(ethAddr: string): Field | undefined {
  const s = store();
  if (!s) return undefined;
  let raw: string | null;
  try {
    raw = s.getItem(key(ethAddr));
  } catch {
    return undefined;
  }
  if (!raw) {
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

/// Persist `nsk` for `ethAddr`. Best-effort: storage errors
/// (quota, privacy mode) are logged and swallowed.
export function cacheNsk(ethAddr: string, nsk: Field): void {
  const s = store();
  if (!s) return;
  try {
    s.setItem(key(ethAddr), nskHexFromField(nsk));
    log.debug("stored");
  } catch (e) {
    log.warn("store failed", e);
  }
}

export function clearCachedNsk(ethAddr: string): void {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(key(ethAddr));
  } catch {
    /* ignore */
  }
}

/// Clear every cached nsk in this tab's sessionStorage.
export function clearAllCachedNsk(): void {
  const s = store();
  if (!s) return;
  try {
    const victims: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) victims.push(k);
    }
    for (const k of victims) s.removeItem(k);
  } catch {
    /* ignore */
  }
}
