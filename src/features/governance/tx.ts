import type { EthSigner, EvmAddress } from "@lelantos-org/sdk";
import { decodeErrorResult, type PublicClient, type TransactionReceipt } from "viem";
import { createLogger } from "@/shared/lib/logger";
import { governorAbi } from "./abi";

const log = createLogger("governance:tx");

/// A governance write: target, calldata and optional value.
export interface GovTxRequest {
  to: EvmAddress;
  data: `0x${string}`;
  value?: bigint | undefined;
  /// Called once the wallet has broadcast, before the receipt lands.
  onSent?: ((hash: `0x${string}`) => void) | undefined;
}

/// What `sendGovernanceTx` needs: a signer, a read client and the sending account.
export interface GovTxDeps {
  signer: Pick<EthSigner, "sendTransaction">;
  client: Pick<PublicClient, "call" | "waitForTransactionReceipt">;
  account: EvmAddress;
}

/// The governor refusals this app explains in its own words.
export type GovErrorCode =
  | "quorum-vote-closed"
  | "already-voted"
  | "not-active"
  | "below-threshold"
  | "unknown-proposal"
  | "bad-proposal"
  | "restricted-proposer"
  | "reverted";

/// A transaction the chain refused, with the reason where it could be read.
export class GovernanceTxError extends Error {
  readonly code: GovErrorCode;
  /// Set when the refusal came after broadcast.
  readonly hash: string | undefined;
  constructor(code: GovErrorCode, message: string, hash?: string) {
    super(message);
    this.name = "GovernanceTxError";
    this.code = code;
    this.hash = hash;
  }
}

const REVERT_KEYS = ["data", "cause", "error", "originalError"] as const;

/// ABI-encoded revert data, wherever a client or wallet nested it. Depth-bounded against cycles.
export function revertData(e: unknown): `0x${string}` | undefined {
  const queue: { node: unknown; depth: number }[] = [{ node: e, depth: 0 }];
  const seen = new Set<unknown>();
  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    if (typeof node === "string") {
      if (/^0x[0-9a-fA-F]{8,}$/.test(node)) return node as `0x${string}`;
      continue;
    }
    if (node === null || typeof node !== "object" || seen.has(node) || depth > 6) continue;
    seen.add(node);
    for (const k of REVERT_KEYS) {
      const next = (node as Record<string, unknown>)[k];
      if (next !== undefined) queue.push({ node: next, depth: depth + 1 });
    }
  }
  return undefined;
}

const CODES: Partial<Record<string, GovErrorCode>> = {
  QuorumVotingClosed: "quorum-vote-closed",
  GovernorAlreadyCastVote: "already-voted",
  GovernorUnexpectedProposalState: "not-active",
  GovernorInsufficientProposerVotes: "below-threshold",
  GovernorNonexistentProposal: "unknown-proposal",
  GovernorInvalidProposalLength: "bad-proposal",
  GovernorRestrictedProposer: "restricted-proposer",
};

/// The governor error a thrown value carries, if it carries one this app knows.
export function governorErrorCode(e: unknown): GovErrorCode | undefined {
  if (e instanceof GovernanceTxError) return e.code;
  const data = revertData(e);
  if (!data) return undefined;
  try {
    const { errorName } = decodeErrorResult({ abi: governorAbi, data });
    return CODES[errorName];
  } catch {
    return undefined;
  }
}

/// Simulate (to surface governor custom errors), send through the wallet, and wait for the receipt.
/// A simulation failing without revert data does not block the send.
export async function sendGovernanceTx(
  deps: GovTxDeps,
  req: GovTxRequest,
): Promise<TransactionReceipt> {
  try {
    await deps.client.call({
      account: deps.account,
      to: req.to,
      data: req.data,
      value: req.value,
    });
  } catch (e) {
    const code = governorErrorCode(e);
    if (code) throw new GovernanceTxError(code, `governor refused: ${code}`);
    if (revertData(e)) throw e;
    log.warn("simulation failed without revert data; sending anyway", e);
  }
  const hash = await deps.signer.sendTransaction({
    to: req.to,
    data: req.data,
    ...(req.value ? { value: req.value } : {}),
  });
  req.onSent?.(hash);
  const receipt = await deps.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new GovernanceTxError("reverted", "transaction reverted", hash);
  }
  return receipt;
}
