// A WebAuthn passkey, as a kind.
//
// It holds a shielded spending key and nothing else — no EVM account, no
// network of its own. Both of those show up here as data rather than as
// branches elsewhere: `chainSource: "app"` and a `keySource` with no signer.

import { deriveNskFromPasskey } from "@lelantos-org/sdk";
import { useMemo } from "react";
import type { ChainEntry } from "@/config/chains";
import { useStore } from "@/shared/lib/external-store";
import { passkeyAccountKey, storedCredential } from "./passkey/credential-storage";
import { passkeysAvailable, prfEvaluator, prfKnownUnsupported } from "./passkey/prf";
import { passkeyStore } from "./passkey/store";
import type { KindSnapshot, WalletKindAdapter } from "./types";

export const passkeyKind: WalletKindAdapter = {
  kind: "passkey",
  // No network to read, so the app selects one. Every chain it can select is
  // one the registry serves, which is why a passkey session can never be
  // stranded on an unsupported network.
  chainSource: "app",

  copy: {
    // Enrolling costs two prompts and attaching costs none, and the label is
    // the only place the user is told which is about to happen.
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

  // Withheld where it cannot work: outside a secure context, in a browser
  // without WebAuthn, and on a device whose authenticator has already been
  // found to lack PRF. There is no fallback derivation, so offering it there
  // would only reproduce a terminal failure.
  available: () => passkeysAvailable() && !prfKnownUnsupported(),

  // Memoised for the reason on `eip1193Kind.useSnapshot`: a fresh `layer` per
  // render re-runs `useBuildWallet`'s effect, and its cleanup aborts the very
  // build the passkey unlock was for — so confirming the passkey does nothing.
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
        // Namespaced so a credential can never collide with an EOA in the nsk
        // cache or a store key. Nothing decodes it — the credential id reaches
        // `keySource` on the layer, typed. Shared with the enrolment-time cache
        // seed in `passkeyStore.connect`, which must produce the same string.
        accountKey: connected ? passkeyAccountKey(credentialId) : undefined,
        chainId,
        layer: connected && credentialId ? { kind: "passkey", credentialId } : undefined,
      };
    }, [status, credentialId, chainId, error]);
  },

  attach: () => void passkeyStore.attachOrEnrol(),
  disconnect: () => passkeyStore.disconnect(),
  // A pure state write: there is no wallet to send `wallet_switchEthereumChain`
  // to, and no 4902 add-then-retry to run.
  switchChain: (target: ChainEntry) => passkeyStore.selectChain(target.chainId),

  keySource(layer) {
    if (layer.kind !== "passkey") throw new Error("passkeyKind: wrong layer");
    return {
      derive: () => deriveNskFromPasskey(prfEvaluator(layer.credentialId)),
      prompt: "a passkey unlock",
    };
  },
};
