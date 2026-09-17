// Wallets lag the chain and sign stale nonces on back-to-back sends; wait for their view to catch up.

import type { EthSigner, Hex32 } from "@lelantos-org/sdk";
import { createLogger } from "@/shared/lib/logger";
import { rpcErrorChain } from "@/shared/lib/rpc-error";
import type { Eip1193Provider } from "./provider";

const log = createLogger("eip1193:nonce-sync");

export interface NonceSyncOptions {
  /// Gap between polls of the wallet's view.
  pollMs?: number;
  /// Longest to wait for the wallet to catch up before sending anyway.
  timeoutMs?: number;
}

const DEFAULT_POLL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/// Stale-nonce refusals: rejected before reaching the pool, so a retry cannot double-send.
const STALE_NONCE =
  /nonce too low|nonce has already been used|replacement transaction underpriced/i;

/// Did the wallet sign a nonce the chain has already moved past? Checks every wrapping depth.
export function isStaleNonce(err: unknown): boolean {
  return rpcErrorChain(err).some(
    (node) => typeof node.message === "string" && STALE_NONCE.test(node.message),
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/// Wrap `inner` to send only once the wallet has seen the previous tx mined, retrying a stale nonce once.
/// `provider` must be the wallet `inner` sends through, not the app's read RPC.
export function withNonceSync(
  inner: EthSigner,
  provider: Eip1193Provider,
  { pollMs = DEFAULT_POLL_MS, timeoutMs = DEFAULT_TIMEOUT_MS }: NonceSyncOptions = {},
): EthSigner {
  let previous: Hex32 | undefined;

  async function poll<T>(read: () => Promise<T | undefined>, deadline: number) {
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value !== undefined || Date.now() + pollMs > deadline) return value;
      await sleep(pollMs);
    }
  }

  async function walletBlock(): Promise<bigint | undefined> {
    const raw = await provider.request({ method: "eth_blockNumber" });
    return typeof raw === "string" ? BigInt(raw) : undefined;
  }

  async function minedIn(hash: Hex32): Promise<bigint | undefined> {
    const receipt = (await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    })) as { blockNumber?: unknown } | null;
    return typeof receipt?.blockNumber === "string" ? BigInt(receipt.blockNumber) : undefined;
  }

  async function reachBlock(target: bigint, deadline: number): Promise<boolean> {
    const reached = await poll(async () => {
      const n = await walletBlock();
      return n !== undefined && n >= target ? n : undefined;
    }, deadline);
    return reached !== undefined;
  }

  /// Wait until the wallet has seen `hash` mined.
  async function catchUp(hash: Hex32): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const block = await poll(() => minedIn(hash), deadline);
    if (block === undefined || !(await reachBlock(block, deadline))) {
      log.warn("wallet did not report the previous transaction mined; sending anyway", { hash });
    }
  }

  /// Send, retrying once if the wallet signed a stale nonce.
  async function sendRetryingStaleNonce(args: Parameters<EthSigner["sendTransaction"]>[0]) {
    try {
      return await inner.sendTransaction(args);
    } catch (err) {
      if (!isStaleNonce(err)) throw err;
      log.warn("wallet signed a stale nonce; retrying once its view advances", err);
      const deadline = Date.now() + timeoutMs;
      const now = await walletBlock().catch(() => undefined);
      if (now === undefined || !(await reachBlock(now + 1n, deadline))) throw err;
      return inner.sendTransaction(args);
    }
  }

  return {
    chainId: inner.chainId,
    getAddress: () => inner.getAddress(),
    signTypedData: (domain, types, primaryType, message) =>
      inner.signTypedData(domain, types, primaryType, message),
    async sendTransaction(args) {
      // Cleared before waiting, so a tx that never mines does not charge every later send the timeout.
      const after = previous;
      previous = undefined;
      if (after) await catchUp(after);
      previous = await sendRetryingStaleNonce(args);
      return previous;
    },
  };
}
