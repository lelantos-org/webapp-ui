// Artifacts must match `connect`'s shape and the verifier's circuits release, or every proof is rejected.
import circuitUrl from "@lelantos-org/circuits/4x6/4x6.wasm?url";
import zkeyUrl from "@lelantos-org/circuits/4x6/4x6_final.zkey?url";
import { type Prover, type ProverArtifacts, WorkerProver } from "@lelantos-org/sdk/prover";
import { createLogger } from "@/shared/lib/logger";
import { timed } from "../build/perf";

const log = createLogger("prover:worker");

const proverArtifacts: ProverArtifacts = {
  circuit: circuitUrl,
  zkey: zkeyUrl,
};

/// True only when the device reports ≤4 GB; unknown (non-Chromium) counts as not low.
function isLowMemoryDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return mem !== undefined && mem <= 4;
}

/// Rayon pool size: `?threads=N`, then `VITE_PROVER_THREADS`, else capped on low-memory devices.
function threadOverride(): number | undefined {
  const fromUrl =
    typeof location === "undefined" ? null : new URLSearchParams(location.search).get("threads");
  const raw = fromUrl ?? import.meta.env.VITE_PROVER_THREADS;
  if (raw) {
    const n = Number.parseInt(String(raw), 10);
    if (Number.isFinite(n)) return n;
  }
  if (isLowMemoryDevice()) return Math.min(4, navigator.hardwareConcurrency || 4);
  return undefined;
}

let cached: WorkerProver | null = null;
let preloadPromise: Promise<void> | null = null;

export function getProverWorker(): WorkerProver {
  if (cached) return cached;
  const threads = threadOverride();
  if (threads !== undefined) log.info(`thread override: ${threads}`);
  // Keep `new Worker(new URL(…))` inline: Vite emits a worker chunk only for that form.
  const worker = new Worker(new URL("@lelantos-org/sdk/workers/prover", import.meta.url), {
    type: "module",
  });
  // Dev serves an unversioned zkey URL, so caching would keep a stale key after a circuits bump.
  cached = new WorkerProver({
    worker,
    artifacts: proverArtifacts,
    threads,
    cacheArtifacts: !import.meta.env.DEV,
  });
  return cached;
}

/// A `Prover` that resolves the shared worker per proof: spawn waits for the first proof and follows reconnects.
export function sharedProver(): Prover {
  return { prove: (input) => timed("prover.prove", () => getProverWorker().prove(input)) };
}

/// Warm the worker (artifacts, wasm, rayon pool) ahead of the first prove. Idempotent.
export function preloadProverWorker(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  if (isLowMemoryDevice()) {
    log.info("low-memory device; skipping preload, first prove will be slow");
    return Promise.resolve();
  }
  preloadPromise = getProverWorker()
    .preload()
    .then(() => log.info("preloaded"))
    .catch((e: unknown) => {
      log.warn("preload failed; first prove will be slow", e);
      preloadPromise = null;
    });
  return preloadPromise;
}

/// Tear down the worker and release its artifacts and rayon pool.
export function disposeProverWorker(): void {
  if (!cached) return;
  cached.dispose();
  cached = null;
  // Cleared with `cached`, or the next preload would no-op against a new worker.
  preloadPromise = null;
}
