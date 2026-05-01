import { configureJubjubWasm } from "@lelantos-org/sdk/crypto";
import jubjubWasmUrl from "@lelantos-org/sdk/wasm/jubjub/wasm?url";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("wasm");

let booted: Promise<void> | undefined;

/// Register SDK WASM loaders. Idempotent; configuration is synchronous — the
/// Promise only lets callers `await` initialisation uniformly.
/// Snarkjs path only: the rust prover's `wasm-bindgen-rayon` glue initialises
/// lazily in its worker chunk (`features/wallet/prover/proverWorker.ts`).
export function ensureWasm(): Promise<void> {
  if (booted) return booted;
  log.debug("registering jubjub loader");
  configureJubjubWasm({
    loadModule: () => import("@lelantos-org/sdk/wasm/jubjub") as Promise<never>,
    wasm: jubjubWasmUrl,
  });
  booted = Promise.resolve();
  return booted;
}

/// Fetch the WASM bytes during idle time so the first crypto call doesn't
/// block on the network. Safe to repeat — the HTTP cache dedups.
export function prefetchWasm(): void {
  const start = () => {
    fetch(jubjubWasmUrl, { credentials: "omit" }).catch(() => {
      /* network may be offline; first real call will retry */
    });
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(start);
  else setTimeout(start, 0);
}
