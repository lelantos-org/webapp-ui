import type { WalletApi } from "@lelantos-org/sdk/wallet";
import type { EphemeralBalance } from "./ephemeral-wallet";

export type Phase =
  | { kind: "reading-fragment" }
  /// `reason` separates a URL that never carried a secret from one whose secret
  /// is unreadable. The machine treats them alike, but the first is what a reload
  /// produces, since the fragment is scrubbed on mount, and reporting it as a
  /// spent link would be incorrect.
  | { kind: "bad-link"; error: string; reason: BadLinkReason }
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
  | { kind: "done"; txHash: string; chainId: bigint; asset: bigint; amount: bigint }
  /// `nskHex` and `chainId` are retained so `retry` can make another attempt. The
  /// URL fragment is scrubbed before anything can fail, so without them a
  /// transient RPC failure during the scan would be terminal and a reload would
  /// destroy the secret.
  | { kind: "error"; message: string; nskHex?: string; chainId?: bigint; from?: "scan" | "sweep" };

export type BadLinkReason = "missing" | "malformed";

export type Event =
  | { t: "fragment-good"; nskHex: string; chainId: bigint }
  | { t: "fragment-missing" }
  | { t: "fragment-bad"; error: string }
  | { t: "load-start" }
  | { t: "load-success"; eph: WalletApi; balances: EphemeralBalance[] }
  | { t: "load-failure"; message: string }
  | { t: "sweep-start"; asset: bigint; amount: bigint }
  | { t: "sweep-success"; txHash: string }
  | { t: "sweep-failure"; message: string }
  | { t: "retry" };

export const initial: Phase = { kind: "reading-fragment" };

/// Pure reducer; illegal transitions return the current phase unchanged.
export function reduce(s: Phase, e: Event): Phase {
  switch (e.t) {
    case "fragment-missing":
      return s.kind === "reading-fragment"
        ? { kind: "bad-link", error: "missing claim secret in URL fragment", reason: "missing" }
        : s;
    case "fragment-bad":
      return s.kind === "reading-fragment"
        ? { kind: "bad-link", error: e.error, reason: "malformed" }
        : s;
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
            from: "scan",
            ...("nskHex" in s ? { nskHex: s.nskHex, chainId: s.chainId } : {}),
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
        ? {
            kind: "done",
            txHash: e.txHash,
            // Retained: the asset labels are chain-scoped, so dropping the id
            // would leave the success card showing raw circuit units and an
            // `asset#<id>` label.
            chainId: s.chainId,
            asset: s.asset,
            amount: s.amount,
          }
        : s;
    case "sweep-failure":
      return s.kind === "sweeping"
        ? {
            kind: "error",
            message: e.message,
            nskHex: s.nskHex,
            chainId: s.chainId,
            from: "sweep",
          }
        : s;
    case "retry":
      // The only exit from `error`. Without it the phase is terminal and a
      // transient failure during the scan ends the claim.
      return s.kind === "error" && s.nskHex !== undefined && s.chainId !== undefined
        ? { kind: "need-wallet", nskHex: s.nskHex, chainId: s.chainId }
        : s;
  }
}
