import { useState } from "react";
import type { GovTxState } from "./components/GovTxStatus";

/// The part of a governance mutation a status card reads.
interface TxMutation {
  status: GovTxState["status"];
  error: unknown;
  reset(): void;
}

/// A governance write's hash beside its mutation.
///
/// The hash arrives through the mutation's `onSent`, before the receipt, so the
/// card can move from "approve in your wallet" to "waiting for the block". It
/// belongs to one attempt: `begin` clears it before a send, and `tx.reset`
/// clears it with the mutation.
export function useGovTx(mutation: TxMutation) {
  const [hash, setHash] = useState<string>();
  const tx: GovTxState = {
    status: mutation.status,
    error: mutation.error,
    hash,
    reset: () => {
      setHash(undefined);
      mutation.reset();
    },
  };
  return { tx, onSent: setHash, begin: () => setHash(undefined) };
}
