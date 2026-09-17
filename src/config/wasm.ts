import { configureJubjubWasm } from "@lelantos-org/sdk/primitives";
import jubjubWasmUrl from "@lelantos-org/sdk/wasm/jubjub/wasm?url";
import { createLogger } from "@/shared/lib/logger";
import { whenIdle } from "@/shared/lib/when-idle";

const log = createLogger("wasm");

let booted: Promise<void> | undefined;

/// Register the SDK's jubjub WASM loader. Idempotent.
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

/// Warm the WASM bytes in the HTTP cache during idle time.
export function prefetchWasm(): void {
  const start = () => {
    fetch(jubjubWasmUrl, { credentials: "omit" }).catch(() => {});
  };
  whenIdle(start);
}
