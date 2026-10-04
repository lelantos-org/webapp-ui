import { configureJubjubWasm } from "@lelantos-org/sdk/primitives";
import jubjubWasmUrl from "@lelantos-org/sdk/wasm/jubjub/wasm?url";
import { createLogger } from "@/shared/lib/logger";
import { whenIdle } from "@/shared/lib/when-idle";

const log = createLogger("wasm");

let registered = false;

/// Register the SDK's jubjub WASM loader. Idempotent.
export function ensureWasm(): void {
  if (registered) return;
  registered = true;
  log.debug("registering jubjub loader");
  configureJubjubWasm({
    loadModule: () => import("@lelantos-org/sdk/wasm/jubjub") as Promise<never>,
    wasm: jubjubWasmUrl,
  });
}

/// Warm the WASM bytes in the HTTP cache during idle time.
export function prefetchWasm(): void {
  const start = () => {
    fetch(jubjubWasmUrl, { credentials: "omit" }).catch(() => {});
  };
  whenIdle(start);
}
