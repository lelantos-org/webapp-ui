// Artifacts must match `connect`'s shape and the verifier's circuits release, or every proof is rejected.
import circuitUrl from "@lelantos-org/circuits/4x6/4x6.wasm?url";
import zkeyUrl from "@lelantos-org/circuits/4x6/4x6_final.zkey?url";
import {
  PROVER_ARTIFACT_SHA256,
  type Prover,
  type ProverArtifacts,
  WorkerProver,
} from "@lelantos-org/sdk/prover";
import { createLogger } from "@/shared/lib/logger";
import { timed } from "../build/perf";
import { evictStaleArtifacts } from "./artifact-eviction";

const log = createLogger("prover:worker");

// Pinned to the published release: a mismatching proving key is refused before parsing, whether fetched or cached.
const proverArtifacts: ProverArtifacts = {
  circuit: circuitUrl,
  zkey: zkeyUrl,
  sha256: PROVER_ARTIFACT_SHA256["4x6"],
};

/// True only when the device reports ≤4 GB; unknown (non-Chromium) counts as not low.
function isLowMemoryDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return mem !== undefined && mem <= 4;
}

/// Rayon pool size: `?threads=N`, then `VITE_PROVER_THREADS`, else capped on low-memory devices,
/// else every core but one.
function threadOverride(): number | undefined {
  const fromUrl =
    typeof location === "undefined" ? null : new URLSearchParams(location.search).get("threads");
  const raw = fromUrl ?? import.meta.env.VITE_PROVER_THREADS;
  if (raw) {
    const n = Number.parseInt(String(raw), 10);
    if (Number.isFinite(n)) return n;
  }
  if (isLowMemoryDevice()) return Math.min(4, navigator.hardwareConcurrency || 4);
  // One core stays free for the page: a proof on every core starves the stepper it is shown in.
  const cores = typeof navigator === "undefined" ? undefined : navigator.hardwareConcurrency;
  return cores ? Math.max(2, cores - 1) : undefined;
}

/// Dev serves an unversioned zkey URL, so caching would keep a stale key after a circuits bump.
const CACHE_ARTIFACTS = !import.meta.env.DEV;

let cached: WorkerProver | null = null;
let loading: Promise<void> | null = null;
let loaded = false;

function getProverWorker(): WorkerProver {
  if (cached) return cached;
  const threads = threadOverride();
  if (threads !== undefined) log.info(`thread override: ${threads}`);
  // Keep `new Worker(new URL(…))` inline: Vite emits a worker chunk only for that form.
  const worker = new Worker(new URL("@lelantos-org/sdk/workers/prover", import.meta.url), {
    type: "module",
  });
  cached = new WorkerProver({
    worker,
    artifacts: proverArtifacts,
    threads,
    cacheArtifacts: CACHE_ARTIFACTS,
  });
  return cached;
}

/// Load the worker's artifacts, wasm and thread pool. Idempotent; a failed load is retried by the
/// next call.
function loadProver(): Promise<void> {
  if (loading) return loading;
  const worker = getProverWorker();
  loading = worker.preload().then(
    () => {
      // A worker disposed mid-load is not the one a later proof will use.
      if (cached !== worker) return;
      loaded = true;
      log.info("loaded");
      // Only now: this release's artifacts are cached, so nothing still in use is dropped.
      if (CACHE_ARTIFACTS) void evictStaleArtifacts([circuitUrl, zkeyUrl]);
    },
    (e: unknown) => {
      if (cached === worker) loading = null;
      throw e;
    },
  );
  return loading;
}

/// Whether the prover is ready to prove without fetching anything first.
export function isProverLoaded(): boolean {
  return loaded;
}

/// Resolves once the prover has loaded, or has failed to: the proof then reports the failure.
export function whenProverLoaded(): Promise<void> {
  return loadProver().catch(() => {});
}

/// A `Prover` that resolves the shared worker per proof: spawn waits for the first proof and follows reconnects.
export function sharedProver(): Prover {
  return {
    prove: async (input) => {
      // Loaded here rather than inside the proof, so the wait is seen as a load, not as proving.
      await whenProverLoaded();
      return timed("prover.prove", () => getProverWorker().prove(input));
    },
  };
}

/// Warm the worker (artifacts, wasm, rayon pool) ahead of the first prove. Idempotent.
export function preloadProverWorker(): Promise<void> {
  if (isLowMemoryDevice() && !loading) {
    log.info("low-memory device; skipping preload, first prove will be slow");
    return Promise.resolve();
  }
  return loadProver().catch((e: unknown) => {
    log.warn("preload failed; first prove will be slow", e);
  });
}

/// Tear down the worker and release its artifacts and rayon pool.
export function disposeProverWorker(): void {
  if (!cached) return;
  cached.dispose();
  cached = null;
  // Cleared with `cached`, or the next load would no-op against a new worker.
  loading = null;
  loaded = false;
}
