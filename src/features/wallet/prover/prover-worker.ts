// Vite recognises the `new Worker(new URL(..., import.meta.url), { type:
// "module" })` pattern and emits a separate worker chunk, keeping
// `WasmProver` and the rust pkg out of the main bundle.

// 4x4 is the SDK's default shape and what the deployed verifier accepts. These
// artifacts must match it: a mismatch builds witnesses of the wrong arity and
// every proof is rejected.
import circuitUrl from "@lelantos-org/circuits/4x4/4x4.wasm?url";
import zkeyUrl from "@lelantos-org/circuits/4x4/4x4_final.zkey?url";
import { type ProverArtifacts, WorkerProver } from "@lelantos-org/sdk/prover";
import { createLogger } from "@/shared/lib/logger";
import { asSdkWorker } from "@/shared/lib/worker";

const log = createLogger("prover:worker");

const proverArtifacts: ProverArtifacts = {
  circuit: circuitUrl,
  zkey: zkeyUrl,
};

/// True only when the device reports 4 GB or less.
///
/// `deviceMemory` is Chromium-only and coarse. An absent value means unknown and
/// is treated as not low: Safari and Firefox report nothing, so treating absence
/// as low memory would withhold the preload from those browsers and impose the
/// first-prove latency on all of them.
function isLowMemoryDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return mem !== undefined && mem <= 4;
}

/// Rayon pool size. `?threads=N` takes precedence over `VITE_PROVER_THREADS`;
/// with neither set the SDK default (`min(8, hardwareConcurrency)`) applies,
/// except on a low-memory device where the pool is capped so the prover's
/// thread stacks do not displace the rest of the tab.
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
  // The `new Worker(new URL(…))` literal must stay inline here rather than
  // going through the SDK's `browserWorkerProver`; see `asSdkWorker`.
  const worker = asSdkWorker(
    new Worker(new URL("@lelantos-org/sdk/prover-worker", import.meta.url), { type: "module" }),
  );
  cached = new WorkerProver({ worker, paths: proverArtifacts, threads });
  return cached;
}

/// Warm the worker: build `WasmProver`, fetch the zkey and circuit wasm, and init
/// the rayon pool. Idempotent; call from a non-blocking path to avoid 5–10s of
/// setup latency on the first prove.
///
/// Triggered by intent to transact — hovering or focusing an action tab, or
/// focusing an amount input — rather than by wallet construction, so a session
/// that only reads a balance never loads the ~53 MB of artifacts or spawns the
/// rayon pool. The interval between hover and submit covers the setup window.
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

/// Tear down the worker and release the zkey, circuit wasm and rayon pool.
/// Called on disconnect, where any subsequent prove follows a fresh connect.
export function disposeProverWorker(): void {
  if (!cached) return;
  cached.dispose();
  cached = null;
  // Cleared alongside `cached`: a resolved `preloadPromise` outliving the worker
  // it warmed would make the next `preloadProverWorker()` a no-op against a newly
  // constructed worker, moving the setup cost into `prove()`.
  preloadPromise = null;
}
