import type { RegisteredAsset } from "@/config/chains";
import { findAsset } from "@/features/assets";
import { parseAmountSafe, SHIELDED_RECIPIENT } from "@/features/op-form";
import { memoProblem } from "@/shared/domain/memo";
import { isPaymentRequestFragment, type PaymentRequest, parsePaymentRequest } from "./codec";

/// What the page's fragment asks of the Send form on the active chain.
export type RequestState =
  /// No request in the fragment, or the chain's assets are not known yet.
  | { status: "none" }
  /// A request with a part missing or unreadable.
  | { status: "invalid" }
  /// A request for another chain's pool; asset ids do not carry across.
  | { status: "other-chain"; chainId: bigint }
  /// The active chain registers no asset under the requested id.
  | { status: "unlisted-asset" }
  | { status: "ready"; request: PaymentRequest; asset: RegisteredAsset };

const NONE: RequestState = { status: "none" };
const INVALID: RequestState = { status: "invalid" };

/// Reads `hash` as a payment request against the active chain and its registered assets.
export function resolvePaymentRequest(
  hash: string,
  chainId: bigint | undefined,
  assets: readonly RegisteredAsset[],
): RequestState {
  if (chainId === undefined || !isPaymentRequestFragment(hash)) return NONE;

  const request = parsePaymentRequest(hash);
  if (!request || SHIELDED_RECIPIENT.problem(request.to) !== undefined) return INVALID;
  if (memoProblem(request.memo ?? "") !== undefined) return INVALID;
  if (request.chainId !== chainId) return { status: "other-chain", chainId: request.chainId };
  if (assets.length === 0) return NONE;

  const asset = findAsset(assets, request.asset);
  if (!asset) return { status: "unlisted-asset" };

  const parsed = parseAmountSafe(request.amount, asset);
  if (parsed === undefined || parsed <= 0n) return INVALID;
  return { status: "ready", request, asset };
}
