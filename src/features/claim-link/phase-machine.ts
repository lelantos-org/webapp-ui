import type { WalletApi } from "@lelantos-org/sdk/wallet";
import type { EphemeralBalance } from "@/features/claim-link/claimLink";

export type Phase =
  | { kind: "reading-fragment" }
  | { kind: "bad-link"; error: string }
  | { kind: "need-wallet"; nskHex: string; chainId: bigint }
  | { kind: "loading"; nskHex: string; chainId: bigint }
  | { kind: "ready"; nskHex: string; chainId: bigint; eph: WalletApi; balances: EphemeralBalance[] }
  | {
      kind: "sweeping";
      nskHex: string;
      chainId: bigint;
      eph: WalletApi;
      balances: EphemeralBalance[];
      asset: bigint;
      amount: bigint;
    }
  | { kind: "done"; txHash: string; asset: bigint; amount: bigint }
  | { kind: "error"; message: string; nskHex?: string };

export type Event =
  | { t: "fragment-good"; nskHex: string; chainId: bigint }
  | { t: "fragment-missing" }
  | { t: "fragment-bad"; error: string }
  | { t: "load-start" }
  | { t: "load-success"; eph: WalletApi; balances: EphemeralBalance[] }
  | { t: "load-failure"; message: string }
  | { t: "sweep-start"; asset: bigint; amount: bigint }
  | { t: "sweep-success"; txHash: string }
  | { t: "sweep-failure"; message: string };

export const initial: Phase = { kind: "reading-fragment" };

/// Pure reducer; illegal transitions return the current phase unchanged.
export function reduce(s: Phase, e: Event): Phase {
  switch (e.t) {
    case "fragment-missing":
      return s.kind === "reading-fragment"
        ? { kind: "bad-link", error: "missing claim secret in URL fragment" }
        : s;
    case "fragment-bad":
      return s.kind === "reading-fragment" ? { kind: "bad-link", error: e.error } : s;
    case "fragment-good":
      return s.kind === "reading-fragment"
        ? { kind: "need-wallet", nskHex: e.nskHex, chainId: e.chainId }
        : s;
    case "load-start":
      return s.kind === "need-wallet"
        ? { kind: "loading", nskHex: s.nskHex, chainId: s.chainId }
        : s;
    case "load-success":
      return s.kind === "loading"
        ? { kind: "ready", nskHex: s.nskHex, chainId: s.chainId, eph: e.eph, balances: e.balances }
        : s;
    case "load-failure":
      return s.kind === "loading" || s.kind === "need-wallet"
        ? {
            kind: "error",
            message: e.message,
            ...("nskHex" in s ? { nskHex: s.nskHex } : {}),
          }
        : s;
    case "sweep-start":
      return s.kind === "ready"
        ? {
            kind: "sweeping",
            nskHex: s.nskHex,
            chainId: s.chainId,
            eph: s.eph,
            balances: s.balances,
            asset: e.asset,
            amount: e.amount,
          }
        : s;
    case "sweep-success":
      return s.kind === "sweeping"
        ? { kind: "done", txHash: e.txHash, asset: s.asset, amount: s.amount }
        : s;
    case "sweep-failure":
      return s.kind === "sweeping" ? { kind: "error", message: e.message, nskHex: s.nskHex } : s;
  }
}
