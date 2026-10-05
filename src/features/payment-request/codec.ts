/// What a request link asks for. Nothing in it is secret: the address is the one the requester shares.
export interface PaymentRequest {
  /// The chain whose pool the asset id belongs to.
  chainId: bigint;
  /// The requester's shielded address. Not shape-checked here; see `resolvePaymentRequest`.
  to: string;
  asset: bigint;
  /// Plain decimal text in the asset's own units, as the amount field takes it.
  amount: string;
  /// The memo the requester asks to be sent with the payment. Absent for none. Not checked against
  /// what a payment can carry; see `resolvePaymentRequest`.
  memo?: string | undefined;
}

/// The path a request link opens: the Send form.
const PAY_PATH = "/send";

const UINT = /^(0|[1-9]\d{0,77})$/;
const AMOUNT = /^\d{1,40}(\.\d{1,40})?$/;

/// `to=<address>&asset=<id>&amount=<decimal>&chain=<id>`, ids in decimal, then `&memo=<text>`
/// when the request carries one.
export function encodePaymentRequest({ to, asset, amount, chainId, memo }: PaymentRequest): string {
  const params = new URLSearchParams({
    to,
    asset: asset.toString(),
    amount,
    chain: chainId.toString(),
  });
  if (memo) params.set("memo", memo);
  return params.toString();
}

/// The link that asks for `request`. It rides in the fragment, which is never sent to a server.
export function paymentRequestUrl(origin: string, request: PaymentRequest): string {
  return `${origin}${PAY_PATH}#${encodePaymentRequest(request)}`;
}

function fragmentParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
}

/// Whether a URL hash is meant as a request at all; `#main` and the like are not.
export function isPaymentRequestFragment(hash: string): boolean {
  return fragmentParams(hash).has("to");
}

/// Reads a URL hash as a request, or `undefined` when a part is missing or unreadable. Unknown keys
/// are ignored.
export function parsePaymentRequest(hash: string): PaymentRequest | undefined {
  const params = fragmentParams(hash);
  const to = params.get("to");
  const asset = params.get("asset") ?? "";
  const amount = params.get("amount") ?? "";
  const chain = params.get("chain") ?? "";
  const memo = params.get("memo") ?? "";
  if (!to || !UINT.test(chain) || !UINT.test(asset) || !AMOUNT.test(amount)) return undefined;

  const chainId = BigInt(chain);
  if (chainId === 0n) return undefined;
  return { chainId, to, asset: BigInt(asset), amount, ...(memo ? { memo } : {}) };
}
