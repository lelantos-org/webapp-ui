import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("perf");

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(1)}ms`;
}

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    log.debug(`${label}: ${fmtMs(performance.now() - t0)}`);
  }
}

/// Marks a wrapper this module installed, so re-instrumenting is a no-op.
const WRAPPED = Symbol.for("lelantos.perf.wrapped");

/// Monkey-patch SDK collaborators on `wallet` to log per-call timings.
///
/// Idempotent per method. Not every collaborator is per-wallet — `wallet.prover`
/// is the module-level worker singleton — so without the guard each chain switch
/// and each claim-link build would add another wrapper layer, duplicating every
/// timing line and retaining the scope of every wallet built.
export function instrumentWallet(wallet: WalletApi): void {
  const wrapMethod = <T extends object, K extends keyof T>(obj: T, key: K, label: string) => {
    const orig = obj[key] as unknown as (...a: unknown[]) => Promise<unknown>;
    if (typeof orig !== "function") return;
    if ((orig as { [WRAPPED]?: true })[WRAPPED]) return;
    const wrapped = async (...args: unknown[]): Promise<unknown> =>
      timed(label, () => orig.apply(obj, args));
    (wrapped as { [WRAPPED]?: true })[WRAPPED] = true;
    (obj as Record<string, unknown>)[key as string] = wrapped;
  };

  wrapMethod(wallet.prover, "prove", "prover.prove");
  wrapMethod(wallet.submitter, "submit", "submitter.submit");
  wrapMethod(wallet.noteSource, "listNotes", "noteSource.listNotes");
  for (const k of [
    "fetchAsset",
    "signPermit2",
    "payerAddress",
    "maspAddress",
    "chainId",
  ] as const) {
    wrapMethod(wallet.chain, k, `chain.${k}`);
  }
}
