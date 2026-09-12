// Keeping a browser wallet's nonce in step across back-to-back transactions.
//
// The app waits for its receipts on its own read RPC, but the wallet picks the
// nonce from its own view of the chain, and that view lags. Wallets poll for new
// blocks far slower than a dev chain mines them and cache nonce lookups per block,
// so a second transaction sent the moment the first one's receipt lands is
// signed with the first one's nonce. The node refuses it (`nonce too low`),
// which is how Permit2 setup died at "submit allowances on-chain" right after
// the ERC-20 approval mined.
//
// The fix is to wait for the wallet, not the app, to see the previous
// transaction before asking it for the next one, and to wait and ask once more
// if it still signs a stale nonce.

import type { EthSigner, Hex32 } from "@lelantos-org/sdk";
import { createLogger } from "@/shared/lib/logger";
import { rpcErrorChain } from "@/shared/lib/rpc-error";
import type { Eip1193Provider } from "./provider";

const log = createLogger("eip1193:nonce-sync");

export interface NonceSyncOptions {
  /// Gap between polls of the wallet's view.
  pollMs?: number;
  /// Longest to wait for the wallet to catch up before sending anyway.
  ///
  /// Bounded because the wait only improves the odds: a wallet that never
  /// reports the block still gets its prompt, and the node's answer is final.
  timeoutMs?: number;
}

const DEFAULT_POLL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/// Wording nodes and wallets use for a transaction whose nonce is already taken.
///
/// All three mean the node refused the transaction before it reached the pool,
/// so nothing was broadcast and asking again cannot double-send.
const STALE_NONCE =
  /nonce too low|nonce has already been used|replacement transaction underpriced/i;

/// Did the wallet sign a nonce the chain has already moved past?
///
/// Read at every wrapping depth: MetaMask and Rabby put the node's wording under
/// a generic `-32603`.
export function isStaleNonce(err: unknown): boolean {
  return rpcErrorChain(err).some(
    (node) => typeof node.message === "string" && STALE_NONCE.test(node.message),
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/// Wrap `inner` so each transaction is sent only once the wallet has seen the
/// previous one mined, and a stale-nonce refusal is retried once after the
/// wallet's view advances.
///
/// `provider` must be the wallet `inner` sends through: the point is to read the
/// chain as the wallet sees it, and the app's read RPC is already ahead.
export function withNonceSync(
  inner: EthSigner,
  provider: Eip1193Provider,
  { pollMs = DEFAULT_POLL_MS, timeoutMs = DEFAULT_TIMEOUT_MS }: NonceSyncOptions = {},
): EthSigner {
  /// The last transaction this signer broadcast, which the next one must follow.
  let previous: Hex32 | undefined;

  /// Poll `read` until it yields a value, or give up at `deadline`.
  ///
  /// A failed read counts as "not yet" rather than aborting: the wait is advisory,
  /// and a wallet refusing a read method should cost a delay, not the send.
  async function poll<T>(read: () => Promise<T | undefined>, deadline: number) {
    for (;;) {
      const value = await read().catch(() => undefined);
      if (value !== undefined || Date.now() + pollMs > deadline) return value;
      await sleep(pollMs);
    }
  }

  /// The latest block the wallet reports.
  async function walletBlock(): Promise<bigint | undefined> {
    const raw = await provider.request({ method: "eth_blockNumber" });
    return typeof raw === "string" ? BigInt(raw) : undefined;
  }

  /// The block `hash` mined in, as the wallet's node reports it.
  async function minedIn(hash: Hex32): Promise<bigint | undefined> {
    const receipt = (await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    })) as { blockNumber?: unknown } | null;
    return typeof receipt?.blockNumber === "string" ? BigInt(receipt.blockNumber) : undefined;
  }

  /// Whether the wallet reports block `target` or later before `deadline`.
  async function reachBlock(target: bigint, deadline: number): Promise<boolean> {
    const reached = await poll(async () => {
      const n = await walletBlock();
      return n !== undefined && n >= target ? n : undefined;
    }, deadline);
    return reached !== undefined;
  }

  /// Wait until the wallet has seen `hash` mined.
  ///
  /// Two reads, because they answer different questions. The receipt says the
  /// wallet's node has the transaction, and asking for it through the wallet is
  /// also what nudges MetaMask's block tracker forward. The block number says the
  /// wallet's own tracker, which keys its nonce cache, has reached that block.
  async function catchUp(hash: Hex32): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const block = await poll(() => minedIn(hash), deadline);
    if (block === undefined || !(await reachBlock(block, deadline))) {
      log.warn("wallet did not report the previous transaction mined; sending anyway", { hash });
    }
  }

  /// Send, retrying once if the wallet signed a stale nonce.
  ///
  /// There is nothing to sync against when the conflicting transaction came from
  /// outside this signer, so the retry waits out one block of the wallet's own
  /// view instead: its nonce cache is keyed by that block.
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
      // Cleared before waiting, whether or not the wallet catches up: a
      // transaction that never mines would otherwise charge the full timeout to
      // every later send.
      const after = previous;
      previous = undefined;
      if (after) await catchUp(after);
      previous = await sendRetryingStaleNonce(args);
      return previous;
    },
  };
}
