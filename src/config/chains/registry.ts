// Fetching `/chains` and the `localStorage` copy that lets the app paint before
// the relayer answers.
//
// The only module here that does I/O. Both paths funnel through
// `entriesFromResponse`, so a cached body is validated exactly as a fresh one
// is.

import { env } from "@/config/env";
import { createLogger } from "@/shared/lib/logger";
import { localStore, writeJson } from "@/shared/lib/storage";
import { entriesFromResponse } from "./parse";
import type { ChainEntry } from "./types";

const log = createLogger("chains");

/// How long to wait on the relayer before giving up on the registry.
///
/// Without a bound, a relayer that accepts the connection and then stalls leaves
/// the query pending indefinitely while `ChainProvider` renders "loading
/// chains…" in place of the entire app.
const REGISTRY_TIMEOUT_MS = 10_000;

/// Where the last successful `/chains` body is kept.
///
/// Namespaced by relayer URL and carrying a schema version. `env.relayerUrl` is
/// absolute (`serviceUrl` in config/env.ts applies `toAbsoluteUrl`), so the
/// namespace is per-origin as well as per-path and a build pointed at one
/// relayer cannot read a body written by a build pointed at another. Bump `v1`
/// when the expected shape changes.
const REGISTRY_CACHE_KEY = `lelantos.chain-registry.v1.${env.relayerUrl}`;

/// The last registry this browser saw, if any.
///
/// `ChainProvider` renders this immediately and revalidates behind it. The
/// registry gates every wallet-facing read, so this keeps a cold or slow relayer
/// from holding the whole app on a spinner for a round-trip.
///
/// Returns `undefined` rather than `[]` for an unusable entry, so the caller
/// cannot mistake "nothing cached" for "the relayer serves nothing" — the
/// distinction `loadChainRegistry` draws between throwing and resolving
/// empty.
export function readCachedChainRegistry(): ChainEntry[] | undefined {
  const raw = localStore.get(REGISTRY_CACHE_KEY);
  if (raw === undefined) return undefined;
  try {
    const entries = entriesFromResponse(JSON.parse(raw), "cache");
    return entries.length > 0 ? entries : undefined;
  } catch (e) {
    // Unusable rather than absent: drop it, so a body that will never parse is
    // not re-read and re-rejected on every boot.
    log.warn("discarding unusable cached chain registry", e);
    localStore.remove(REGISTRY_CACHE_KEY);
    return undefined;
  }
}

/// The chains this deployment can talk to.
///
/// Throws when the registry cannot be read, keeping an unreachable relayer
/// distinguishable from one serving an empty list. Resolving `[]` in both cases
/// would report a 502 as an empty registry and leave nothing to retry from.
export async function loadChainRegistry(): Promise<ChainEntry[]> {
  const r = await fetch(`${env.relayerUrl}/chains`, {
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`relayer /chains responded ${r.status}`);
  const body: unknown = await r.json();
  const entries = entriesFromResponse(body, "relayer");

  // Cache the raw body rather than the mapped entries: `ChainEntry` holds
  // bigints, which `JSON.stringify` rejects, and storing the relayer's own
  // response makes the cache read run the same validation as this path.
  //
  // Only a non-empty result is kept. An empty one is a valid answer, but seeding
  // a future boot with it would render the "no usable network" screen from cache
  // before the relayer had been asked again.
  if (entries.length > 0) writeJson(localStore, REGISTRY_CACHE_KEY, body);

  // An empty result is a valid answer: the relayer replied and nothing it serves
  // is usable here. Distinct from the throw above, which means no answer was
  // received; the provider words the two cases differently.
  return entries;
}
