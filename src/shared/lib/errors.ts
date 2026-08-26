import { InsufficientCoverError, NetworkError, WalletError } from "@lelantos-org/sdk/errors";
import { hasRpcCode, rpcErrorMessage } from "@/shared/lib/rpc-error";

/// Map a thrown value to a short, user-facing string.
export function describeError(e: unknown): string {
  if (e instanceof WalletError) return describeWalletError(e);
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

export type ErrorKind = "rejected" | "failed";

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

/// User-facing one-liner for an error. Never returns a raw stack trace or hex
/// selector.
export function friendlyMessage(e: unknown): string {
  const c = classifyError(e);
  if (c.kind === "rejected") return "Canceled in wallet.";
  // A curated code is already specific, and the keyword pass would only widen
  // it: every "Prover artifacts …" line contains "prover", so a 404 on the zkey
  // would be reported as a failed proof. Only codes falling through to the raw
  // SDK message reach the keyword heuristics.
  if (e instanceof WalletError) {
    const w = walletErrorText(e);
    if (w.curated) return w.text;
  }
  const raw = c.raw;
  const lower = raw.toLowerCase();
  const advice = KEYWORD_ADVICE.find((entry) => entry.when(lower));
  if (advice) return advice.text;
  if (raw && raw.length < 140 && !HEX_BLOB.test(raw) && !raw.includes("\n")) {
    return raw;
  }
  return "Something went wrong. Please try again.";
}

/// Classify an error as a user-cancellation (wallet popup rejected) vs any
/// other failure.
export function classifyError(e: unknown): { kind: ErrorKind; raw: string } {
  const raw = describeError(e);
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
  // server-side 500 as "Canceled in wallet." and, since cancellations are not
  // logged, leave no record of it.
  if (/\buser (rejected|denied|cancell?ed)\b/.test(lower) || lower.includes("rejected by user")) {
    return { kind: "rejected", raw };
  }
  return { kind: "failed", raw };
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

function describeWalletError(e: WalletError): string {
  return walletErrorText(e).text;
}

/// The user-facing line for a wallet error, plus whether it was written for that
/// code (`curated`) or is the SDK's own message passed through.
///
/// `friendlyMessage` depends on the distinction: a curated line is final, while
/// a pass-through message is what the keyword heuristics apply to.
function walletErrorText(e: WalletError): { text: string; curated: boolean } {
  return { text: describeCode(e), curated: CURATED_CODES.has(e.code) };
}

/// Codes `describeCode` writes a line for. Anything else — `SELECTION`,
/// `INVALID_ARGUMENT`, or a code added by a newer SDK — falls through to the raw
/// message and the keyword pass.
const CURATED_CODES = new Set<string>([
  "INSUFFICIENT_COVER",
  "WALLET_CONFIG",
  "RELAYER_TIMEOUT",
  "RELAYER_FAILED",
  "FMD_TIMEOUT",
  "FMD_FAILED",
  "PROVER_FAILED",
  "PROVER_ARTIFACTS_MISSING",
  "PROVER_ARTIFACTS_FAILED",
  "WORKER_TIMEOUT",
  "WORKER_CRASHED",
  "WORKER_FAILED",
  "WIRE_FORMAT",
  "ENVIRONMENT",
  "X402_PAYMENT",
  "NETWORK_NOT_DEPLOYED",
  "PERMIT_REJECTED",
  "DEPOSIT_ADAPTER",
  "TX_MINING",
]);

function describeCode(e: WalletError): string {
  switch (e.code) {
    case "INSUFFICIENT_COVER": {
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
    case "WALLET_CONFIG":
      return `Wallet misconfigured: ${e.message}`;
    case "RELAYER_TIMEOUT":
      return "Relayer timed out. Retry shortly.";
    case "RELAYER_FAILED":
      return isDuplicateSpend(e)
        ? describeDuplicateSpend(e)
        : "Relayer rejected the request. Check the relayer logs or your network.";
    case "FMD_TIMEOUT":
      return "Note discovery (FMD) timed out. Retry shortly.";
    case "FMD_FAILED":
      return "Note discovery (FMD) request failed.";
    case "PROVER_FAILED":
      return "Proof generation failed. Reload to reset the prover and retry.";
    case "PROVER_ARTIFACTS_MISSING":
      return "Prover artifacts missing. Reload to refetch and retry.";
    case "PROVER_ARTIFACTS_FAILED":
      return "Prover artifacts failed to load. Check your connection and reload.";
    case "WORKER_TIMEOUT":
      return "A background worker timed out. Reload and retry.";
    case "WORKER_CRASHED":
    case "WORKER_FAILED":
      return "A background worker failed. Reload to restart it and retry.";
    case "WIRE_FORMAT":
      return "Unexpected response from the server. Retry shortly.";
    case "ENVIRONMENT":
      return `Unsupported browser environment: ${e.message}`;
    case "X402_PAYMENT":
      return "Payment required by the service was refused.";
    case "NETWORK_NOT_DEPLOYED":
      return `Network not deployed: ${e.message}`;
    case "PERMIT_REJECTED":
      return "Signature rejected in wallet.";
    case "DEPOSIT_ADAPTER":
      return `Wallet adapter cannot satisfy this deposit: ${e.message}`;
    case "TX_MINING":
      return "Transaction did not mine. Retry or check the explorer.";
    // `SELECTION` and `INVALID_ARGUMENT` already carry a user-readable message.
    // The SDK documents its code list as open, so unknown codes land here too.
    default:
      return e.message;
  }
}
