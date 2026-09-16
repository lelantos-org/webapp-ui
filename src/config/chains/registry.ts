// Fetching the three bodies the registry is built from, and the `localStorage`
// copy that lets the app paint before either service has answered.
//
// The only module here that does I/O. Both paths funnel through
// `entriesFromResponse`, so a cached bundle is validated and cross-checked
// exactly as a fresh one is.

import { env } from "@/config/env";
import { createLogger } from "@/shared/lib/logger";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore, writeJson } from "@/shared/lib/storage/safe";
import { entriesFromResponse } from "./parse";
import type { ChainEntry } from "./types";

const log = createLogger("chains");

/// How long to wait on a service before giving up on the registry.
///
/// Without a bound, a service that accepts the connection and then stalls leaves
/// the query pending indefinitely while `ChainProvider` renders "loading
/// chains…" in place of the entire app.
const REGISTRY_TIMEOUT_MS = 10_000;

/// Where the last successful bundle is kept.
///
/// Namespaced by both service URLs and carrying a schema version. Both are
/// absolute (`serviceUrl` in config/env.ts applies `toAbsoluteUrl`), so the
/// namespace is per-origin as well as per-path. Both appear because the bundle
/// is a merge of the two: keyed on the relayer alone, repointing only the
/// registry would read back chains described by a registry no longer in use.
/// Bump its version in `shared/lib/storage/keys.ts` when the expected shape
/// changes.
const REGISTRY_CACHE_KEY = LOCAL_KEYS.chainRegistry(env.registryUrl, env.relayerUrl);

/// The last registry this browser saw, if any.
///
/// `ChainProvider` renders this immediately and revalidates behind it. The
/// registry gates every wallet-facing read, so this keeps a cold or slow service
/// from holding the whole app on a spinner for a round-trip.
///
/// Returns `undefined` rather than `[]` for an unusable entry, so the caller
/// cannot mistake "nothing cached" for "the deployment serves nothing" — the
/// distinction `loadChainRegistry` draws between throwing and resolving empty.
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

/// One JSON GET, named so a failure says which service was behind it.
///
/// Every fetch here is on the boot path and all three are equally required, so a
/// caller learns nothing from a bare "fetch failed" — which of the two services
/// is unreachable is the first thing an operator needs.
async function getJson(label: string, url: string): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${label} responded ${r.status}`);
  return r.json();
}

/// The chains this deployment can talk to.
///
/// Reads both services: protocol-webserver for what each chain is and what is
/// registered on it, the relayer for what it will do on each. `parse.ts` keeps
/// only the chains both describe, and only where their two accounts agree.
///
/// Throws when any of the three cannot be read, keeping an unreachable service
/// distinguishable from a deployment serving an empty list. Resolving `[]` in
/// both cases would report a 502 as an empty registry and leave nothing to retry
/// from.
export async function loadChainRegistry(): Promise<ChainEntry[]> {
  // In parallel: three sequential round-trips would put two extra latencies on
  // first paint, and none of the three depends on another's answer.
  const [registryChains, assets, relayerChains] = await Promise.all([
    getJson("registry /v1/chains", `${env.registryUrl}/v1/chains`),
    // Every chain at once, rather than one request per chain: the chain switcher
    // needs all of them, and the catalog is small enough that splitting it would
    // buy a loading state on chain switch and nothing else.
    getJson("registry /v1/assets", `${env.registryUrl}/v1/assets`),
    getJson("relayer /chains", `${env.relayerUrl}/chains`),
  ]);

  const body = { registryChains, assets, relayerChains };
  const entries = entriesFromResponse(body, "network");

  // Cache the raw bodies rather than the merged entries: `ChainEntry` holds
  // bigints, which `JSON.stringify` rejects, and storing what the services
  // returned makes the cache read run the same validation and the same
  // cross-check as this path.
  //
  // Only a non-empty result is kept. An empty one is a valid answer, but seeding
  // a future boot with it would render the "no usable network" screen from cache
  // before either service had been asked again.
  if (entries.length > 0) writeJson(localStore, REGISTRY_CACHE_KEY, body);

  // An empty result is a valid answer: both services replied and nothing they
  // agree on is usable here. Distinct from the throw above, which means no answer
  // was received; the provider words the two cases differently.
  return entries;
}
