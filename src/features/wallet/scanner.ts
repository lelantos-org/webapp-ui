// FMD note scanner, shared by the main wallet and the claim page.
//
// Separate from `buildWallet` so the claim page can import a scanner without
// pulling the chain adapter and the rest of the wallet-build graph into its
// bundle.

import { WorkerPoolScanner } from "@lelantos-org/sdk/sync";
import type { WalletApi } from "@lelantos-org/sdk/wallet";
import jubjubWasmUrl from "@lelantos-org/sdk/wasm/jubjub/wasm?url";
import jubjubModuleUrl from "@lelantos-org/sdk/wasm/jubjub?url";
import { createLogger } from "@/shared/lib/logger";
import { asSdkWorker } from "@/shared/lib/worker";

const log = createLogger("wallet:scanner");

/// Off-main-thread trial decryption. The `new Worker(new URL(…))` literal must
/// stay inline here; see `asSdkWorker`.
function scannerWorker() {
  return asSdkWorker(
    new Worker(new URL("@lelantos-org/sdk/scanner-worker", import.meta.url), { type: "module" }),
  );
}

/// Worker count for a full wallet.
///
/// Capped below the SDK default of `max(2, min(8, hardwareConcurrency))`. The
/// pool spawns eagerly and each worker loads the jubjub wasm on init, while
/// beyond roughly four workers the scan is bound by message passing and feed
/// bandwidth rather than trial decryption.
function defaultSize(): number {
  return Math.max(2, Math.min(4, navigator.hardwareConcurrency || 4));
}

/// A worker-pool scanner. Callers own it and must pass the holding wallet to
/// `releaseScanner`; nothing else releases these workers.
export function createScanner(size: number = defaultSize()): WorkerPoolScanner {
  return new WorkerPoolScanner({
    factory: scannerWorker,
    size,
    wasm: { jubjubModuleUrl, jubjubWasmUrl },
  });
}

/// Release a wallet's scanner workers.
///
/// Required on every path that abandons a wallet: disconnect, chain switch,
/// claim-page unmount. A `WalletApi` going out of scope does not release them:
/// they are live workers, each holding a jubjub wasm instance, and persist until
/// disposed.
///
/// Idempotent, and neither throws nor rejects. Callers are teardown paths such as
/// React cleanups and disconnect handlers, where a rejection has no handler, and
/// the workers are unreachable regardless, so a failure is only logged.
export function releaseScanner(wallet: WalletApi | undefined): void {
  const scanner = wallet?.scanner;
  if (!scanner?.dispose) return;
  Promise.resolve()
    .then(() => scanner.dispose?.())
    .catch((e: unknown) => log.warn("scanner dispose failed", e));
}
