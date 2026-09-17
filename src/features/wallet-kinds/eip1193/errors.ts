import { hasRpcCode, rpcErrorMessage } from "@/shared/lib/rpc-error";

const UNRECOGNIZED_CHAIN = 4902;

/// Did the wallet refuse because the chain is unknown? Matches bare 4902, wrapped 4902, or the message.
export function isUnrecognizedChain(err: unknown): boolean {
  if (hasRpcCode(err, UNRECOGNIZED_CHAIN)) return true;
  return /unrecognized chain/i.test(rpcErrorMessage(err) ?? "");
}
