// Errors, read for logs and worded for users.
//
// A thrown value is read two ways: as the message it carries (`rawMessage`, for
// logs and matching) and as the line a user should see (`userMessage`). The SDK's
// `WalletError` codes are worded in `wallet-copy.ts`; faults recognised only by
// their message text get `keyword-advice.ts`; `reportError` shows the user's line
// and logs the cause. Unwrapping nested EIP-1193 rejections is `../rpc-error.ts`.

import { isWalletError } from "@lelantos-org/sdk";
import { createLogger } from "@/shared/lib/logger";
import { hasRpcCode, rpcErrorMessage } from "@/shared/lib/rpc-error";
import { isPresentable, keywordAdvice } from "./keyword-advice";
import { walletErrorText } from "./wallet-copy";

export { isDuplicateSpend } from "./wallet-copy";

// A thrown value, read two ways: as the message it carries, and as the line a
// user should see.

/// What a user cancellation reads as, wherever it is shown.
export const CANCELED_IN_WALLET = "Canceled in wallet.";

/// Shown when nothing more specific can be said.
const GENERIC = "Something went wrong. Please try again.";

type ErrorKind = "rejected" | "failed";

/// The thrown value's own message: the wallet's or the browser's wording, hex
/// and all, and a `WalletError`'s line for its code. For logs and for matching
/// on message text. Anything rendered to the user goes through `userMessage`.
export function rawMessage(e: unknown): string {
  if (isWalletError(e)) return walletErrorText(e).text;
  if (e instanceof Error) return e.message;
  // EIP-1193 providers reject with a plain `{ code, message, data }` object
  // rather than an `Error`, which `String(e)` would render as "[object Object]"
  // while the wallet's own message sits one or two properties away.
  const message = rpcErrorMessage(e);
  if (message !== undefined) return message;
  // No message anywhere, but a code is still diagnostic: "-32603" in a bug
  // report can be looked up.
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === "number" || typeof code === "string") return `Wallet error ${code}`;
  return String(e);
}

/// Classify an error as a user-cancellation (wallet popup rejected) vs any
/// other failure.
export function classifyError(e: unknown): { kind: ErrorKind; raw: string } {
  const raw = rawMessage(e);
  // The SDK has already recognised the cancellation, at whatever depth the
  // wallet buried it; nothing below needs to read it again.
  if (isWalletError(e, "USER_REJECTED")) {
    return { kind: "rejected", raw };
  }
  // EIP-1193 user-rejection codes and common wallet messages, read at any depth:
  // the wrapping that hides `4902` from `switchChain` hides `4001` here, and a
  // cancellation misread as a fault is logged and shown as a failure.
  if (hasRpcCode(e, 4001, "ACTION_REJECTED")) {
    return { kind: "rejected", raw };
  }
  const lower = raw.toLowerCase();
  // Anchored on the user rather than on "rejected": a bare `rejected the
  // request` also matches the relayer's refusal text, which would report a
  // server-side 500 as `CANCELED_IN_WALLET` and, since cancellations are not
  // logged, leave no record of it.
  if (/\buser (rejected|denied|cancell?ed)\b/.test(lower) || lower.includes("rejected by user")) {
    return { kind: "rejected", raw };
  }
  return { kind: "failed", raw };
}

/// User-facing one-liner for an error. Never returns a raw stack trace or hex
/// selector.
export function userMessage(e: unknown): string {
  const c = classifyError(e);
  if (c.kind === "rejected") return CANCELED_IN_WALLET;
  // A curated code is already specific, and the keyword pass could only widen
  // it: a curated line that happens to say "expired" or "permit" would be
  // rewritten by a rule written for a wallet's wording. Only codes falling
  // through to the raw SDK message reach the keyword heuristics.
  if (isWalletError(e)) {
    const w = walletErrorText(e);
    if (w.curated) return w.text;
  }
  return keywordAdvice(c.raw) ?? (isPresentable(c.raw) ? c.raw : GENERIC);
}

// Reporting.

const log = createLogger("error");

export interface ReportedError {
  kind: ErrorKind;
  /// One line safe to render to the user.
  message: string;
}

/// Turn a thrown value into something showable while keeping the cause.
///
/// `userMessage` classifies by keyword and falls back to a generic line, so
/// on its own it can discard the only record of the fault — a viem revert reduces
/// to "Something went wrong". Pairing the two here means a caller cannot show the
/// summary without preserving the detail.
///
/// A user cancellation is not logged: declining a wallet prompt is not a fault.
export function reportError(scope: string, error: unknown): ReportedError {
  const { kind } = classifyError(error);
  if (kind === "rejected") return { kind, message: CANCELED_IN_WALLET };
  log.error(scope, error);
  return { kind, message: userMessage(error) };
}
