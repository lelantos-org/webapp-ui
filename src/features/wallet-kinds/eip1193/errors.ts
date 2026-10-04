import { hasRpcCode, rpcErrorMessage } from "@/shared/lib/rpc-error";

const UNRECOGNIZED_CHAIN = 4902;
/// EIP-1193 "unsupported method": wallets with a fixed network list (Phantom) refuse `wallet_addEthereumChain`.
const UNSUPPORTED_METHOD = 4200;

/// Whether the wallet refused because the chain is unknown. Matches bare 4902, wrapped 4902, or the message.
export function isUnrecognizedChain(err: unknown): boolean {
  if (hasRpcCode(err, UNRECOGNIZED_CHAIN)) return true;
  return /unrecognized chain/i.test(rpcErrorMessage(err) ?? "");
}

/// Whether the wallet refused because it cannot use the chain, as opposed to not having it yet.
export function isUnsupportedChain(err: unknown): boolean {
  if (hasRpcCode(err, UNSUPPORTED_METHOD)) return true;
  return /unsupported|not supported/i.test(rpcErrorMessage(err) ?? "");
}
