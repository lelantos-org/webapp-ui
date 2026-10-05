/// What a request link asks for. Nothing in it is secret: the address is the one the requester shares.
export interface PaymentRequest {
  /// The chain whose pool the asset id belongs to.
  chainId: bigint;
  /// The requester's shielded address. Not shape-checked here; see `resolvePaymentRequest`.
  to: string;
  asset: bigint;
  /// Plain decimal text in the asset's own units, as the amount field takes it.
  amount: string;
}

/// The path a request link opens: the Send form.
const PAY_PATH = "/send";

const UINT = /^(0|[1-9]\d{0,77})$/;
const AMOUNT = /^\d{1,40}(\.\d{1,40})?$/;

/// `to=<address>&asset=<id>&amount=<decimal>&chain=<id>`, ids in decimal.
export function encodePaymentRequest({ to, asset, amount, chainId }: PaymentRequest): string {
  return new URLSearchParams({
    to,
    asset: asset.toString(),
    amount,
    chain: chainId.toString(),
  }).toString();
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
  if (!to || !UINT.test(chain) || !UINT.test(asset) || !AMOUNT.test(amount)) return undefined;

  const chainId = BigInt(chain);
  if (chainId === 0n) return undefined;
  return { chainId, to, asset: BigInt(asset), amount };
}
