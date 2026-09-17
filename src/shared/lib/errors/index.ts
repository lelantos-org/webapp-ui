import { isWalletError } from "@lelantos-org/sdk";
import { createLogger } from "@/shared/lib/logger";
import { hasRpcCode, rpcErrorMessage } from "@/shared/lib/rpc-error";
import { isPresentable, keywordAdvice } from "./keyword-advice";
import { walletErrorText } from "./wallet-copy";

export { isDuplicateSpend } from "./wallet-copy";

/// What a user cancellation reads as, wherever it is shown.
export const CANCELED_IN_WALLET = "Canceled in wallet.";

const GENERIC = "Something went wrong. Please try again.";

type ErrorKind = "rejected" | "failed";

/// The thrown value's own message, for logs and matching. Render `userMessage` instead.
export function rawMessage(e: unknown): string {
  if (isWalletError(e)) return walletErrorText(e).text;
  if (e instanceof Error) return e.message;
  const message = rpcErrorMessage(e);
  if (message !== undefined) return message;
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === "number" || typeof code === "string") return `Wallet error ${code}`;
  return String(e);
}

/// Classify an error as a user cancellation or any other failure.
export function classifyError(e: unknown): { kind: ErrorKind; raw: string } {
  const raw = rawMessage(e);
  if (isWalletError(e, "USER_REJECTED")) {
    return { kind: "rejected", raw };
  }
  if (hasRpcCode(e, 4001, "ACTION_REJECTED")) {
    return { kind: "rejected", raw };
  }
  const lower = raw.toLowerCase();
  // Anchored on "user": bare "rejected" also matches relayer refusals, which would then go unlogged.
  if (/\buser (rejected|denied|cancell?ed)\b/.test(lower) || lower.includes("rejected by user")) {
    return { kind: "rejected", raw };
  }
  return { kind: "failed", raw };
}

/// User-facing one-liner for an error; never a stack trace or hex selector.
export function userMessage(e: unknown): string {
  const c = classifyError(e);
  if (c.kind === "rejected") return CANCELED_IN_WALLET;
  if (isWalletError(e)) {
    const w = walletErrorText(e);
    if (w.curated) return w.text;
  }
  return keywordAdvice(c.raw) ?? (isPresentable(c.raw) ? c.raw : GENERIC);
}

const log = createLogger("error");

export interface ReportedError {
  kind: ErrorKind;
  /// One line safe to render to the user.
  message: string;
}

/// A showable message for a thrown value; logs the cause unless the user cancelled.
export function reportError(scope: string, error: unknown): ReportedError {
  const { kind } = classifyError(error);
  if (kind === "rejected") return { kind, message: CANCELED_IN_WALLET };
  log.error(scope, error);
  return { kind, message: userMessage(error) };
}
