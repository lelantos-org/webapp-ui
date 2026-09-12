// Errors, read for logs and worded for users.
//
// A thrown value is read two ways: as the message it carries (`rawMessage`, for
// logs and matching) and as the line a user should see (`userMessage`). The SDK's
// `WalletError` codes are worded here; faults recognised only by their message
// text get keyword advice; `reportError` shows the user's line and logs the cause.
// Unwrapping nested EIP-1193 rejections is `rpc-error.ts`.

import { InsufficientCoverError, NetworkError, WalletError } from "@lelantos-org/sdk/errors";
import { createLogger } from "@/shared/lib/logger";
import { hasRpcCode, rpcErrorMessage } from "@/shared/lib/rpc-error";

// The SDK's `WalletError` codes, in the user's terms.

/// A spend the relayer refused because one of its nullifiers is already spent or
/// in flight, the only condition it answers 409 to.
///
/// Singled out because it is the one failure the local note store can be wrong
/// about: it still lists notes the chain has consumed, so every retry re-selects
/// them and is refused again until a resync drops them. Callers act on it rather
/// than only reporting it.
export function isDuplicateSpend(e: unknown): e is NetworkError {
  return e instanceof NetworkError && e.status === 409;
}

/// What the relayer refused, in the user's terms.
///
/// The two 409s call for different advice — one is a wait, the other a resync —
/// and the distinction exists only in the response body, so it is read rather
/// than flattened into "relayer rejected the request".
function describeDuplicateSpend(e: NetworkError): string {
  const inFlight = e.body?.toLowerCase().includes("in flight") ?? false;
  return inFlight
    ? "Another spend of these notes is still being processed. Wait for it to finish, then retry."
    : "These notes were already spent. Resyncing — check the chain before retrying.";
}

/// The user-facing line for a wallet error, plus whether it was written for that
/// code (`curated`) or is the SDK's own message passed through.
///
/// `userMessage` depends on the distinction: a curated line is final, while a
/// pass-through message is what the keyword heuristics apply to.
export function walletErrorText(e: WalletError): { text: string; curated: boolean } {
  const copy = Object.hasOwn(WALLET_CODE_COPY, e.code) ? WALLET_CODE_COPY[e.code] : undefined;
  if (copy === undefined) return { text: e.message, curated: false };
  return { text: typeof copy === "string" ? copy : copy(e), curated: true };
}

/// The line written for each code. Anything else — `SELECTION` and
/// `INVALID_ARGUMENT`, which already carry a user-readable message, or a code
/// added by a newer SDK, whose list is documented as open — falls through to the
/// raw message and the keyword pass.
const WALLET_CODE_COPY: Record<string, string | ((e: WalletError) => string)> = {
  INSUFFICIENT_COVER: describeInsufficientCover,
  WALLET_CONFIG: (e) => `Wallet misconfigured: ${e.message}`,
  RELAYER_TIMEOUT: "Relayer timed out. Retry shortly.",
  RELAYER_FAILED: (e) =>
    isDuplicateSpend(e)
      ? describeDuplicateSpend(e)
      : "Relayer rejected the request. Check the relayer logs or your network.",
  FMD_TIMEOUT: "Note discovery (FMD) timed out. Retry shortly.",
  FMD_FAILED: "Note discovery (FMD) request failed.",
  PROVER_FAILED: "Proof generation failed. Reload to reset the prover and retry.",
  PROVER_ARTIFACTS_MISSING: "Prover artifacts missing. Reload to refetch and retry.",
  PROVER_ARTIFACTS_FAILED: "Prover artifacts failed to load. Check your connection and reload.",
  WORKER_TIMEOUT: "A background worker timed out. Reload and retry.",
  WORKER_CRASHED: "A background worker failed. Reload to restart it and retry.",
  WORKER_FAILED: "A background worker failed. Reload to restart it and retry.",
  WIRE_FORMAT: "Unexpected response from the server. Retry shortly.",
  ENVIRONMENT: (e) => `Unsupported browser environment: ${e.message}`,
  X402_PAYMENT: "Payment required by the service was refused.",
  NETWORK_NOT_DEPLOYED: (e) => `Network not deployed: ${e.message}`,
  PERMIT_REJECTED: "Signature rejected in wallet.",
  DEPOSIT_ADAPTER: (e) => `Wallet adapter cannot satisfy this deposit: ${e.message}`,
  TX_MINING: "Transaction did not mine. Retry or check the explorer.",
};

function describeInsufficientCover(e: WalletError): string {
  const c = e instanceof InsufficientCoverError ? e : undefined;
  const head = `Insufficient cover${c ? ` for ${c.target}` : ""}.`;
  const n = c?.consolidate.length ?? 0;
  if (n === 0) return `${head} Top up the asset balance.`;
  // The wallet always requests consolidation, so `consolidationAttempted`
  // is what distinguishes a cover that consolidation could still fix from
  // one where it has already run and failed.
  const tip = c?.consolidationAttempted
    ? "Merging notes didn't free up enough — pay the relayer in the asset you're sending, " +
      "or wait a block and retry."
    : `Consolidate ${n} smallest note${n === 1 ? "" : "s"} first.`;
  return `${head} ${tip}`;
}

// Advice for faults recognised by their message text.
//
// The fallback for errors that carry no code worth switching on: a viem revert,
// a wallet's own wording, an SDK message passed through uncurated.

/// Hex long enough to be a selector (8), address (40), hash (64) or calldata.
///
/// The length bound keeps short values such as a chain id (`0x7a69`) from
/// matching, which would flatten an otherwise readable wallet message to
/// "Something went wrong".
const HEX_BLOB = /0x[0-9a-fA-F]{8,}/;

/// Does the message contain any of these?
const anyOf =
  (...words: string[]) =>
  (lower: string) =>
    words.some((w) => lower.includes(w));

/// Both must hold; used by the one rule that is a conjunction rather than a
/// list.
const both = (a: (s: string) => boolean, b: (s: string) => boolean) => (lower: string) =>
  a(lower) && b(lower);

/// Advice for the faults worth wording here, matched on the raw message.
///
/// Order is significant: several rules overlap and the first match wins.
/// "allowance" would otherwise absorb an expired permit that the quote rule
/// above it words better, and "revert" at the bottom would absorb most of the
/// list. A single ordered table makes placement the only thing to check when
/// adding a rule.
const KEYWORD_ADVICE: ReadonlyArray<{ when(lower: string): boolean; text: string }> = [
  {
    // The selector's wording for notes reserved by a spend whose outcome the
    // wallet never learned (SDK >= 0.17). Those notes are released on their
    // own, so this is a wait rather than an insufficient balance.
    when: anyOf("awaiting an earlier spend"),
    text: "Some notes are still tied up in an earlier spend. Retry in a few minutes.",
  },
  {
    when: anyOf("insufficient cover", "insufficient balance"),
    text: "Insufficient balance for this amount.",
  },
  {
    when: anyOf("slippage", "min out", "minout"),
    text: "Price moved past your slippage limit. Refresh quote and retry.",
  },
  { when: anyOf("expired", "deadline"), text: "Quote expired. Refresh and retry." },
  {
    when: anyOf("nonce too low", "replacement transaction"),
    text: "Wallet nonce conflict. Reset pending txs and retry.",
  },
  {
    when: anyOf("allowance", "permit"),
    text: "Token approval missing or expired. Re-run setup.",
  },
  {
    // Reaches the user only when adding the chain also failed, since the switch
    // path adds it automatically. Worded here because the wallet's own message
    // does not state the action to take.
    when: anyOf("unrecognized chain", "unrecognized network"),
    text: "Your wallet does not have this network. Add it in the wallet, then retry.",
  },
  {
    when: both(anyOf("network"), anyOf("changed", "disconnect")),
    text: "Network changed mid-flight. Reconnect wallet and retry.",
  },
  { when: anyOf("relayer"), text: "Relayer rejected the request. Retry shortly." },
  {
    when: anyOf("prover", "proof"),
    text: "Proof generation failed. Reload to reset the prover.",
  },
  {
    when: anyOf("execution reverted", "revert"),
    text: "Transaction reverted on-chain. Check balance and slippage, then retry.",
  },
];

/// The worded advice for a raw message, if any rule recognises it.
export function keywordAdvice(raw: string): string | undefined {
  const lower = raw.toLowerCase();
  return KEYWORD_ADVICE.find((entry) => entry.when(lower))?.text;
}

/// Whether a raw message can be shown as it is: present, one short line, and no
/// hex payload in it.
export function isPresentable(raw: string): boolean {
  return !!raw && raw.length < 140 && !HEX_BLOB.test(raw) && !raw.includes("\n");
}

// A thrown value, read two ways: as the message it carries, and as the line a
// user should see.

/// What a user cancellation reads as, wherever it is shown.
export const CANCELED_IN_WALLET = "Canceled in wallet.";

/// Shown when nothing more specific can be said.
const GENERIC = "Something went wrong. Please try again.";

export type ErrorKind = "rejected" | "failed";

/// The thrown value's own message: the wallet's or the browser's wording, hex
/// and all, and a `WalletError`'s line for its code. For logs and for matching
/// on message text. Anything rendered to the user goes through `userMessage`.
export function rawMessage(e: unknown): string {
  if (e instanceof WalletError) return walletErrorText(e).text;
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
  if (e instanceof WalletError && e.code === "PERMIT_REJECTED") {
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
  // A curated code is already specific, and the keyword pass would only widen
  // it: every "Prover artifacts …" line contains "prover", so a 404 on the zkey
  // would be reported as a failed proof. Only codes falling through to the raw
  // SDK message reach the keyword heuristics.
  if (e instanceof WalletError) {
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
