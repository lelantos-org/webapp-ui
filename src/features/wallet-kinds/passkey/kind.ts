import { deriveNskFromPasskey } from "@lelantos-org/sdk";
import { useMemo } from "react";
import type { ChainEntry } from "@/config/chains";
import { useStore } from "@/shared/lib/external-store";
import type { KindSnapshot, WalletKindAdapter } from "../types";
import { passkeyAccountKey, storedCredential } from "./credential-storage";
import { passkeysAvailable, prfEvaluator, prfKnownUnsupported } from "./prf";
import { passkeyStore } from "./store";

export const passkeyKind: WalletKindAdapter = {
  kind: "passkey",
  chainSource: "app",

  copy: {
    label: () => (storedCredential() ? "Passkey" : "Create a passkey"),
    deriving: {
      title: "unlock your passkey",
      body: "confirm with your passkey to derive your shielded key.",
      note: "no funds move. your key is derived from the passkey itself and never leaves this device.",
    },
    accountNote: "held by your passkey — no public account",
    noDepositReason:
      "A passkey holds only your shielded key, not an Ethereum account. Adding funds " +
      "moves tokens from a public account that has to hold them and pay the gas, so it " +
      "needs a browser wallet. Everything else — transfers, withdrawals, swaps and " +
      "claim links — works from your passkey.",
    noDepositAdvice: [
      "Your passkey wallet is fully usable otherwise — anything already inside the pool can be transferred, withdrawn, swapped or sent as a claim link.",
      "To add funds, ask someone to send them to your shielded address, or claim a link.",
    ],
  },

  available: () => passkeysAvailable() && !prfKnownUnsupported(),

  // Memoised: a fresh `layer` per render aborts the wallet build the unlock was for.
  useSnapshot(): KindSnapshot {
    const status = useStore(passkeyStore, (s) => s.status);
    const credentialId = useStore(passkeyStore, (s) => s.credentialId);
    const chainId = useStore(passkeyStore, (s) => s.chainId);
    const error = useStore(passkeyStore, (s) => s.error);

    return useMemo<KindSnapshot>(() => {
      const connected = status === "connected" && !!credentialId;
      return {
        connected,
        connecting: status === "connecting",
        error: status === "error" ? error : undefined,
        accountKey: connected ? passkeyAccountKey(credentialId) : undefined,
        chainId,
        layer: connected && credentialId ? { kind: "passkey", credentialId } : undefined,
      };
    }, [status, credentialId, chainId, error]);
  },

  attach: () => void passkeyStore.attachOrEnrol(),
  disconnect: () => passkeyStore.disconnect(),
  switchChain: (target: ChainEntry) => passkeyStore.selectChain(target.chainId),

  keySource(layer) {
    if (layer.kind !== "passkey") throw new Error("passkeyKind: wrong layer");
    return {
      derive: () => deriveNskFromPasskey(prfEvaluator(layer.credentialId)),
      prompt: "a passkey unlock",
    };
  },
};
