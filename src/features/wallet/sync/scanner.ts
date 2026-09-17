import type { WalletApi } from "@lelantos-org/sdk";
import { type Scanner, WorkerPoolScanner } from "@lelantos-org/sdk/advanced";
import jubjubWasmUrl from "@lelantos-org/sdk/wasm/jubjub/wasm?url";
import jubjubModuleUrl from "@lelantos-org/sdk/wasm/jubjub?url";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("wallet:scanner");

// Keep `new Worker(new URL(…))` inline: Vite emits a worker chunk only for that form.
function scannerWorker(): Worker {
  return new Worker(new URL("@lelantos-org/sdk/workers/scanner", import.meta.url), {
    type: "module",
  });
}

const scanners = new WeakMap<WalletApi, Scanner>();

/// Record that `wallet` holds `scanner`, for `releaseScanner`.
export function holdScanner(wallet: WalletApi, scanner: Scanner): void {
  scanners.set(wallet, scanner);
}

function defaultSize(): number {
  return Math.max(2, Math.min(4, navigator.hardwareConcurrency || 4));
}

/// A worker-pool scanner. Callers own it: `holdScanner`, then `releaseScanner` when done.
export function createScanner(size: number = defaultSize()): WorkerPoolScanner {
  return new WorkerPoolScanner({
    factory: scannerWorker,
    size,
    wasm: { jubjubModuleUrl, jubjubWasmUrl },
  });
}

/// Release a wallet's scanner workers; required wherever a wallet is abandoned. Idempotent, never throws.
export function releaseScanner(wallet: WalletApi | undefined): void {
  const scanner = wallet ? scanners.get(wallet) : undefined;
  if (!wallet || !scanner?.dispose) return;
  scanners.delete(wallet);
  void disposeScanner(scanner);
}

/// Dispose `scanner`, logging rather than propagating a failure.
export function disposeScanner(scanner: Scanner): Promise<void> {
  return Promise.resolve()
    .then(() => scanner.dispose?.())
    .catch((e: unknown) => log.warn("scanner dispose failed", e));
}
