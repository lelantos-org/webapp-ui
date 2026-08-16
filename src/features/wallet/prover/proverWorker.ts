// Vite recognises the `new Worker(new URL(..., import.meta.url), { type:
// "module" })` pattern and emits a separate worker chunk, keeping
// `WasmProver` and the rust pkg out of the main bundle.

import circuitUrl from "@lelantos-org/circuits/3x3/3x3.wasm?url";
import zkeyUrl from "@lelantos-org/circuits/3x3/3x3_final.zkey?url";
import { type ProverArtifacts, WorkerProver } from "@lelantos-org/sdk/prover";
import { createLogger } from "@/shared/lib/logger";
import { asSdkWorker } from "@/shared/lib/worker";

const log = createLogger("prover:worker");

const proverArtifacts: ProverArtifacts = {
  circuit: circuitUrl,
  zkey: zkeyUrl,
};

/// Rayon pool size: `?threads=N` beats `VITE_PROVER_THREADS`, and unset
/// leaves the SDK default (`min(8, hardwareConcurrency)`).
function threadOverride(): number | undefined {
  const fromUrl =
    typeof location === "undefined" ? null : new URLSearchParams(location.search).get("threads");
  const raw = fromUrl ?? import.meta.env.VITE_PROVER_THREADS;
  if (!raw) return undefined;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : undefined;
}

let cached: WorkerProver | null = null;
let preloadPromise: Promise<void> | null = null;

export function getProverWorker(): WorkerProver {
  if (cached) return cached;
  const threads = threadOverride();
  if (threads !== undefined) log.info(`thread override: ${threads}`);
  // The `new Worker(new URL(…))` literal must stay inline here rather than
  // going through the SDK's `browserWorkerProver`; see `asSdkWorker`.
  const worker = asSdkWorker(
    new Worker(new URL("@lelantos-org/sdk/prover-worker", import.meta.url), { type: "module" }),
  );
  cached = new WorkerProver({ worker, paths: proverArtifacts, threads });
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
