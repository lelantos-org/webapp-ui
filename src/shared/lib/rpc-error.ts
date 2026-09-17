/// One level of a wallet rejection, as wallets send it in practice.
interface RpcErrorNode {
  code?: number | string;
  message?: unknown;
  data?: unknown;
}

/// Bounded: `data` is wallet-supplied and may be self-referential.
const MAX_WRAP_DEPTH = 4;

/// The rejection and everything it wraps (`data.originalError`, then `data`), outermost first.
export function rpcErrorChain(err: unknown): RpcErrorNode[] {
  const chain: RpcErrorNode[] = [];
  let node: unknown = err;
  for (let depth = 0; node !== null && node !== undefined && depth < MAX_WRAP_DEPTH; depth++) {
    if (typeof node !== "object") break;
    const e = node as RpcErrorNode;
    chain.push(e);
    const data = e.data as { originalError?: unknown } | null | undefined;
    node = data?.originalError ?? data;
  }
  return chain;
}

/// Whether the rejection carries one of `codes` at any depth, in number or string form.
export function hasRpcCode(err: unknown, ...codes: Array<number | string>): boolean {
  return rpcErrorChain(err).some((node) => codes.some((code) => codeMatches(node.code, code)));
}

/// Explicit, since `Number(actual)` reads `null` and `""` as `0`.
function codeMatches(actual: unknown, wanted: number | string): boolean {
  if (actual === null || actual === undefined) return false;
  if (typeof wanted === "string") return actual === wanted;
  if (typeof actual === "number") return actual === wanted;
  if (typeof actual === "string") return actual.trim() !== "" && Number(actual) === wanted;
  return false;
}

/// The innermost non-empty message, which names the fault rather than the wrapper.
export function rpcErrorMessage(err: unknown): string | undefined {
  const chain = rpcErrorChain(err);
  for (let i = chain.length - 1; i >= 0; i--) {
    const message = chain[i]?.message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return undefined;
}
