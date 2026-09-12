// Wallet-transport error predicates.
//
// Split from `store.ts`: these are pure functions of a rejection, and the store
// is connection state. They read the shape through `shared/lib/rpc-error`,
// which is what knows that wallets nest.

import { hasRpcCode, rpcErrorMessage } from "@/shared/lib/rpc-error";

/// EIP-1193: the wallet does not know this chain, so add it before switching.
const UNRECOGNIZED_CHAIN = 4902;

/// Did the wallet refuse because the chain is unknown to it?
///
/// Wallets report this three ways: the bare code from the spec, the same code
/// wrapped in a generic `-32603`, and, for wallets sending no usable code, in the
/// message alone. Missing any of them skips `wallet_addEthereumChain` and reports
/// an unrecognised chain the app had the RPC URL to add.
export function isUnrecognizedChain(err: unknown): boolean {
  if (hasRpcCode(err, UNRECOGNIZED_CHAIN)) return true;
  return /unrecognized chain/i.test(rpcErrorMessage(err) ?? "");
}
