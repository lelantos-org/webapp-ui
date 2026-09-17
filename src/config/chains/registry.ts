import { env } from "@/config/env";
import { createLogger } from "@/shared/lib/logger";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore, writeJson } from "@/shared/lib/storage/safe";
import { entriesFromResponse } from "./parse";
import type { ChainEntry } from "./types";

const log = createLogger("chains");
const REGISTRY_TIMEOUT_MS = 10_000;

// Keyed on both service URLs: the cached bundle is a merge of the two.
const registryCacheKey = () => LOCAL_KEYS.chainRegistry(env.registryUrl, env.relayerUrl);

/// The last cached registry, or `undefined` (never `[]`) when there is none usable.
export function readCachedChainRegistry(): ChainEntry[] | undefined {
  const raw = localStore.get(registryCacheKey());
  if (raw === undefined) return undefined;
  try {
    const entries = entriesFromResponse(JSON.parse(raw), "cache");
    return entries.length > 0 ? entries : undefined;
  } catch (e) {
    log.warn("discarding unusable cached chain registry", e);
    localStore.remove(registryCacheKey());
    return undefined;
  }
}

async function getJson(label: string, url: string): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${label} responded ${r.status}`);
  return r.json();
}

/// Chains both protocol-webserver and the relayer describe consistently.
///
/// Throws when a service is unreachable; resolves `[]` only when both answered with nothing usable.
export async function loadChainRegistry(): Promise<ChainEntry[]> {
  const [registryChains, assets, relayerChains] = await Promise.all([
    getJson("registry /v1/chains", `${env.registryUrl}/v1/chains`),
    getJson("registry /v1/assets", `${env.registryUrl}/v1/assets`),
    getJson("relayer /chains", `${env.relayerUrl}/chains`),
  ]);

  const body = { registryChains, assets, relayerChains };
  const entries = entriesFromResponse(body, "network");

  // Raw bodies, not entries: bigints do not stringify, and the cache read reruns validation.
  if (entries.length > 0) writeJson(localStore, registryCacheKey(), body);

  return entries;
}
