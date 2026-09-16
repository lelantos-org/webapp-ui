// FMD note scanner, shared by the main wallet and the claim page.
//
// Separate from `buildWallet` so the claim page can import a scanner without
// pulling the chain adapter and the rest of the wallet-build graph into its
// bundle.

import type { WalletApi } from "@lelantos-org/sdk";
import { type Scanner, WorkerPoolScanner } from "@lelantos-org/sdk/advanced";
import jubjubWasmUrl from "@lelantos-org/sdk/wasm/jubjub/wasm?url";
import jubjubModuleUrl from "@lelantos-org/sdk/wasm/jubjub?url";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("wallet:scanner");

/// Off-main-thread trial decryption. A DOM `Worker` satisfies the SDK's
/// `WorkerLike` as it is.
///
/// The `new Worker(new URL(…))` literal must stay inline here. Vite emits a
/// worker chunk only for that exact form; behind a helper that accepts a URL —
/// including the SDK's `browserWorkerScanner` — a small worker entry falls under
/// `build.assetsInlineLimit` and is inlined as a `data:` URL, whose relative
/// imports cannot resolve at runtime.
function scannerWorker(): Worker {
  return new Worker(new URL("@lelantos-org/sdk/workers/scanner", import.meta.url), {
    type: "module",
  });
}

/// The scanner each wallet was connected with.
///
/// The app builds the pool and hands it to `connect`, which uses it but never
/// disposes it; recording it here lets `releaseScanner` free it without reaching
/// into the SDK's internals. Weak, so a wallet dropped without release
/// does not keep its entry alive.
const scanners = new WeakMap<WalletApi, Scanner>();

/// Record that `wallet` holds `scanner`, for `releaseScanner`.
export function holdScanner(wallet: WalletApi, scanner: Scanner): void {
  scanners.set(wallet, scanner);
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

/// A worker-pool scanner. Callers own it: once connected, record it with
/// `holdScanner` and pass the holding wallet to `releaseScanner`; nothing else
/// releases these workers.
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
/// The app built this pool, so the app releases it: the SDK disposes only what it
/// built, and `wallet.dispose()` leaves a caller-supplied scanner running. (The
/// pool is built here rather than from `connect`'s `{ workers }` option because
/// that option carries no wasm URLs for the worker.)
///
/// Idempotent, and neither throws nor rejects. Callers are teardown paths such as
/// React cleanups and disconnect handlers, where a rejection has no handler, and
/// the workers are unreachable regardless, so a failure is only logged.
export function releaseScanner(wallet: WalletApi | undefined): void {
  const scanner = wallet ? scanners.get(wallet) : undefined;
  if (!wallet || !scanner?.dispose) return;
  scanners.delete(wallet);
  void disposeScanner(scanner);
}

/// Dispose `scanner`, logging rather than propagating a failure.
///
/// Never rejects, for the reason on `releaseScanner`; awaitable for a caller that
/// wants the workers gone before it continues.
export function disposeScanner(scanner: Scanner): Promise<void> {
  return Promise.resolve()
    .then(() => scanner.dispose?.())
    .catch((e: unknown) => log.warn("scanner dispose failed", e));
}
