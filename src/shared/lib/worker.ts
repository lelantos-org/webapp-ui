import type { WorkerProver } from "@lelantos-org/sdk/prover";

/// The SDK's structural worker port. No public barrel re-exports the type, so
/// it is recovered from a constructor that consumes it.
export type SdkWorker = ConstructorParameters<typeof WorkerProver>[0]["worker"];

/// Adapt a DOM `Worker` to the SDK's structural worker port. The two differ
/// only in the variance of `onmessage`'s event parameter (`MessageEvent` vs
/// `{ data: unknown }`); a DOM `Worker` satisfies the port at runtime.
///
/// Callers must construct the worker themselves and pass it here, keeping the
/// literal `new Worker(new URL("<specifier>", import.meta.url), { type:
/// "module" })` expression at the call site. Vite emits a worker chunk only
/// for that exact form. Behind a helper that accepts a URL — including the
/// SDK's `browserWorkerProver` and `browserWorkerScanner` — a small worker
/// entry falls under `build.assetsInlineLimit` and is inlined as a `data:`
/// URL, whose relative imports cannot resolve at runtime.
export function asSdkWorker(worker: Worker): SdkWorker {
  return worker as unknown as SdkWorker;
}
