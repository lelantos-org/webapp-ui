// Normalising EIP-1193 / JSON-RPC rejections.
//
// Wallets reject with a plain `{ code, message, data }` object rather than an
// `Error`, and those objects nest. MetaMask and Rabby both build on the
// `rpc-errors` package, which wraps the real fault in a generic `-32603`
// "Internal JSON-RPC error" and puts the original under `data.originalError`, so
// the code and message worth acting on sit one or two levels down. Reading only
// the top level hides the `4902` that lets `switchChain` add a chain, and
// reports the wrapper's text rather than the wallet's.

/// One level of a wallet rejection. Every field is optional: this describes what
/// wallets send in practice, not a guaranteed contract.
export interface RpcErrorNode {
  code?: number | string;
  message?: unknown;
  data?: unknown;
}

/// How far to unwrap before giving up.
///
/// Bounded rather than `while (node)`: `data` is wallet-supplied, and a
/// self-referential value would loop indefinitely. Wallets wrap once, so four
/// leaves headroom without letting a malformed payload hang the tab.
const MAX_WRAP_DEPTH = 4;

/// The rejection and everything it wraps, outermost first.
///
/// Descends into `data.originalError`, then `data` — the two shapes wallets use —
/// stopping at whichever runs out first.
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

/// Does the rejection carry one of `codes`, at any depth?
///
/// Numeric and string forms both match: the spec specifies a number, while
/// wallets also send `"4902"` and named codes such as `"ACTION_REJECTED"`.
export function hasRpcCode(err: unknown, ...codes: Array<number | string>): boolean {
  return rpcErrorChain(err).some((node) => codes.some((code) => codeMatches(node.code, code)));
}

/// Compare one code, tolerating the string spelling without the coercion traps.
///
/// Explicit rather than `Number(actual) === wanted`, which reads `null` and `""`
/// as `0` and would match an error carrying no code against a search for `0`.
function codeMatches(actual: unknown, wanted: number | string): boolean {
  if (actual === null || actual === undefined) return false;
  if (typeof wanted === "string") return actual === wanted;
  if (typeof actual === "number") return actual === wanted;
  if (typeof actual === "string") return actual.trim() !== "" && Number(actual) === wanted;
  return false;
}

/// The most specific message the rejection carries.
///
/// Innermost first: the outer layer carries the generic wrapper text ("Internal
/// JSON-RPC error."), while the layer beneath names the fault.
export function rpcErrorMessage(err: unknown): string | undefined {
  const chain = rpcErrorChain(err);
  for (let i = chain.length - 1; i >= 0; i--) {
    const message = chain[i].message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return undefined;
}
