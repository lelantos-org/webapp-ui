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

/// Monkey-patch SDK collaborators on `wallet` to log per-call timings.
/// Mirrors cli/src/commands/transact.ts.
export function instrumentWallet(wallet: WalletApi): void {
  const wrapMethod = <T extends object, K extends keyof T>(obj: T, key: K, label: string) => {
    const orig = obj[key] as unknown as (...a: unknown[]) => Promise<unknown>;
    if (typeof orig !== "function") return;
    (obj as Record<string, unknown>)[key as string] = async (
      ...args: unknown[]
    ): Promise<unknown> => timed(label, () => orig.apply(obj, args));
  };

  wrapMethod(wallet.prover, "prove", "prover.prove");
  wrapMethod(wallet.submitter, "submit", "submitter.submit");
  for (const k of ["spentSet", "listNotes"] as const) {
    wrapMethod(wallet.noteSource, k, `noteSource.${k}`);
  }
  for (const k of [
    "fetchAsset",
    "fetchFeeBps",
    "signPermit2",
    "payerAddress",
    "maspAddress",
    "chainId",
  ] as const) {
    wrapMethod(wallet.chain, k, `chain.${k}`);
  }
}
