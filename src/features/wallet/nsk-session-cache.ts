import type { Field } from "@lelantos-org/sdk";
import { nskFieldFromHex, nskHexFromField } from "@/features/claim-link/codec";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("nsk-cache");
const PREFIX = "sswap:nsk:";

function key(chainId: bigint, ethAddr: string): string {
  return `${PREFIX}${chainId.toString(16)}:${ethAddr.toLowerCase()}`;
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

/// Read a previously-cached nsk for `(chainId, ethAddr)` from sessionStorage.
/// Returns `undefined` on miss, malformed entry, or unavailable storage.
export function getCachedNsk(chainId: bigint, ethAddr: string): Field | undefined {
  const s = store();
  if (!s) return undefined;
  let raw: string | null;
  try {
    raw = s.getItem(key(chainId, ethAddr));
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
    clearCachedNsk(chainId, ethAddr);
    return undefined;
  }
  log.debug("hit");
  return parsed.value;
}

/// Persist `nsk` for `(chainId, ethAddr)`. Best-effort: storage errors
/// (quota, privacy mode) are logged and swallowed.
export function cacheNsk(chainId: bigint, ethAddr: string, nsk: Field): void {
  const s = store();
  if (!s) return;
  try {
    s.setItem(key(chainId, ethAddr), nskHexFromField(nsk));
    log.debug("stored");
  } catch (e) {
    log.warn("store failed", e);
  }
}

export function clearCachedNsk(chainId: bigint, ethAddr: string): void {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(key(chainId, ethAddr));
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
