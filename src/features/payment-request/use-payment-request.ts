import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useRegisteredAssets } from "@/features/assets";
import { useActiveChainOrUndefined } from "@/features/chain";
import type { PaymentRequest, RecipientRequest } from "./codec";
import { type RequestState, resolvePaymentRequest } from "./resolve";

/// Reads the payment request in the URL fragment and hands it to `fill` once, when the active
/// chain can pay it. A recipient-only request carries just `to`. The fragment stays in the URL,
/// so a reload fills the form again.
export function usePaymentRequest(
  fill: (request: PaymentRequest | RecipientRequest) => void,
): RequestState {
  const { hash } = useLocation();
  const chainId = useActiveChainOrUndefined()?.chainId;
  const assets = useRegisteredAssets();
  const state = useMemo(
    () => resolvePaymentRequest(hash, chainId, assets),
    [hash, chainId, assets],
  );

  const filled = useRef(false);
  useEffect(() => {
    if (filled.current || (state.status !== "ready" && state.status !== "recipient")) return;
    filled.current = true;
    fill(state.request);
  }, [state, fill]);

  return state;
}
