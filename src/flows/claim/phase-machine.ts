import type { WalletApi } from "@lelantos-org/sdk";
import type { EphemeralBalance } from "@/features/claim-links";

export type Phase =
  | { kind: "reading-fragment" }
  | { kind: "bad-link"; error: string; reason: BadLinkReason }
  /// The link is read and its notes not yet looked for. No wallet is needed to look.
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
  | {
      kind: "done";
      txHash: string;
      chainId: bigint;
      asset: bigint;
      amount: bigint;
      /// What the link still holds; `claim-rest` returns to it.
      rest?: ClaimRest | undefined;
    }
  /// Keeps `nskHex`: the URL fragment is already scrubbed, so `retry` is the only way back.
  | { kind: "error"; message: string; nskHex: string; chainId: bigint; from: "scan" | "sweep" };

export type BadLinkReason = "missing" | "malformed";

export interface ClaimRest {
  nskHex: string;
  eph: WalletApi;
  balances: EphemeralBalance[];
}

/// The balances a link still holds once `claimed` is swept.
export function balancesAfter(
  balances: readonly EphemeralBalance[],
  claimed: bigint,
): EphemeralBalance[] {
  return balances.filter((b) => b.asset !== claimed && b.amount > 0n);
}

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
  | { t: "claim-rest" }
  | { t: "rescan" }
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
      return s.kind === "need-wallet" ? { ...s, kind: "loading" } : s;
    case "load-success":
      return s.kind === "loading" ? { ...s, kind: "ready", eph: e.eph, balances: e.balances } : s;
    case "load-failure":
      return s.kind === "loading" || s.kind === "need-wallet"
        ? { kind: "error", message: e.message, nskHex: s.nskHex, chainId: s.chainId, from: "scan" }
        : s;
    case "sweep-start":
      return s.kind === "ready" ? { ...s, kind: "sweeping", asset: e.asset, amount: e.amount } : s;
    case "sweep-success": {
      if (s.kind !== "sweeping") return s;
      const balances = balancesAfter(s.balances, s.asset);
      return {
        kind: "done",
        txHash: e.txHash,
        chainId: s.chainId,
        asset: s.asset,
        amount: s.amount,
        rest: balances.length > 0 ? { nskHex: s.nskHex, eph: s.eph, balances } : undefined,
      };
    }
    case "claim-rest":
      return s.kind === "done" && s.rest ? { kind: "ready", chainId: s.chainId, ...s.rest } : s;
    case "sweep-failure":
      return s.kind === "sweeping"
        ? { kind: "error", message: e.message, nskHex: s.nskHex, chainId: s.chainId, from: "sweep" }
        : s;
    case "retry":
      return s.kind === "error" ? { kind: "need-wallet", nskHex: s.nskHex, chainId: s.chainId } : s;
    case "rescan":
      return s.kind === "ready" ? { kind: "need-wallet", nskHex: s.nskHex, chainId: s.chainId } : s;
  }
}
