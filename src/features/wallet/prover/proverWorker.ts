// Vite recognises the `new Worker(new URL(..., import.meta.url), { type:
// "module" })` pattern and emits a separate worker chunk, keeping
// `WasmProver` + the rust pkg out of the main bundle.

import circuitUrl from "@lelantos-org/circuits/2x2/2x2.wasm?url";
import zkeyUrl from "@lelantos-org/circuits/2x2/2x2_final.zkey?url";
import {
  browserWorkerProver,
  type ProverArtifacts,
  type WorkerProver,
} from "@lelantos-org/sdk/prover";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("prover:worker");

const proverArtifacts: ProverArtifacts = {
  circuit: circuitUrl,
  zkey: zkeyUrl,
};

let cached: WorkerProver | null = null;
let preloadPromise: Promise<void> | null = null;

export function getProverWorker(): WorkerProver {
  if (cached) return cached;
  // `?threads=N` URL param or `VITE_PROVER_THREADS` env var override the
  // rayon pool size. Unset = SDK default (`min(8, hardwareConcurrency)`).
  const urlThreads = (() => {
    if (typeof location === "undefined") return undefined;
    const v = new URLSearchParams(location.search).get("threads");
    return v ? parseInt(v, 10) : undefined;
  })();
  const envThreads = import.meta.env.VITE_PROVER_THREADS
    ? parseInt(import.meta.env.VITE_PROVER_THREADS as string, 10)
    : undefined;
  const threads = urlThreads ?? envThreads;
  if (threads !== undefined) log.info(`thread override: ${threads}`);
  cached = browserWorkerProver({
    workerUrl: new URL("@lelantos-org/sdk/prover-worker", import.meta.url),
    paths: proverArtifacts,
    threads,
  });
  return cached;
}

/// Warm the worker (build `WasmProver`, fetch zkey + circuit wasm, init the
/// rayon pool). Idempotent; call from a non-blocking path to avoid 5–10 s of
/// setup latency on the first prove.
export function preloadProverWorker(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  preloadPromise = getProverWorker()
    .preload()
    .then(() => log.info("preloaded"))
    .catch((e: unknown) => {
      log.warn("preload failed; first prove will be slow", e);
      preloadPromise = null;
    });
  return preloadPromise;
}

export function disposeProverWorker(): void {
  if (!cached) return;
  cached.dispose();
  cached = null;
}
