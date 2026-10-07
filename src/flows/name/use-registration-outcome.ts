import type { RegisterNameResult } from "@lelantos-org/sdk";
import { useEffect } from "react";
import type { ChainEntry } from "@/config/chains";
import { rememberClaimedHandle, useNameRecord } from "@/features/names";
import { type RegistrationOutcome, registrationOutcome } from "./outcome";

/// What became of the registration in `result`; `undefined` before there is one. A receipt the
/// SDK could not read is settled from the registrar's record, and the handle remembered then.
export function useRegistrationOutcome(
  chain: ChainEntry,
  account: string,
  result: RegisterNameResult | undefined,
): RegistrationOutcome | undefined {
  const unread = result !== undefined && result.registered === undefined;
  const record = useNameRecord(chain, unread ? result.label : undefined);
  const outcome = result ? registrationOutcome(result, record.data) : undefined;

  const { chainId } = chain;
  useEffect(() => {
    if (!result || !unread || outcome !== "registered") return;
    rememberClaimedHandle(chainId, account, result);
  }, [result, unread, outcome, chainId, account]);

  return outcome;
}
