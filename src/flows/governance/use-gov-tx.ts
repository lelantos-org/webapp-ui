import { useState } from "react";
import type { GovTxState } from "./components/GovTxStatus";

interface TxMutation {
  status: GovTxState["status"];
  error: unknown;
  reset(): void;
}

/// A governance mutation plus its broadcast hash, set via `onSent` and cleared by `begin`/`tx.reset`.
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
