import type { WalletApi } from "@lelantos-org/sdk";
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

const WRAPPED = Symbol.for("lelantos.perf.wrapped");

/// Monkey-patch the chain layer on `wallet` to log per-call timings. Idempotent per method.
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

  for (const k of ["fetchAsset", "maspAddress", "chainId"] as const) {
    wrapMethod(wallet.chain, k, `chain.${k}`);
  }
  if (wallet.capabilities.deposit) {
    for (const k of ["signPermit2", "payerAddress"] as const) {
      wrapMethod(wallet.chain as unknown as Record<typeof k, unknown>, k, `chain.${k}`);
    }
  }
}
