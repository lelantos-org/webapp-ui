import { ARTIFACT_CACHE_NAME } from "@lelantos-org/sdk/prover";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("prover:cache");

/// Drops every cached prover artifact but `keep`, and resolves to how many went. The cache is
/// keyed by URL and each circuits release has its own, so without this every earlier release's
/// proving key (tens of MB) stays on the device for good.
export async function evictStaleArtifacts(keep: readonly string[]): Promise<number> {
  if (typeof caches === "undefined") return 0;
  try {
    const current = new Set(keep.map((url) => new URL(url, location.href).href));
    const cache = await caches.open(ARTIFACT_CACHE_NAME);
    const stale = (await cache.keys()).filter((request) => !current.has(request.url));
    await Promise.all(stale.map((request) => cache.delete(request)));
    if (stale.length > 0) log.info(`dropped ${stale.length} artifacts of earlier releases`);
    return stale.length;
  } catch (e) {
    log.warn("could not clear earlier releases' artifacts", e);
    return 0;
  }
}
