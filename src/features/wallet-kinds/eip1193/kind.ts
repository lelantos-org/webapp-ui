// The injected browser wallet, as a kind.

import { deriveNskFromSigner, evmAddress } from "@lelantos-org/sdk";
import { Eip1193Signer } from "@lelantos-org/sdk/advanced";
import { useMemo } from "react";
import type { ChainEntry } from "@/config/chains";
import { useStore } from "@/shared/lib/external-store";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";
import type { KindSnapshot, WalletKindAdapter } from "../types";
import { withNonceSync } from "./nonce-sync";
import { eip1193Store } from "./store";

const log = createLogger("eip1193:switch-chain");

export const eip1193Kind: WalletKindAdapter = {
  kind: "eip1193",
  // The wallet is the authority on its own network: the app could otherwise
  // claim one chain while the wallet sat on another, with the disagreement
  // surfacing only as a switch prompt at submit.
  chainSource: "wallet",

  copy: {
    label: () => "Browser wallet",
    // Never "the signature only proves ownership of your eth address": that is
    // false in the direction that matters. `deriveNskFromSigner` reduces this
    // signature straight to the spending key.
    // The message is a public constant with no origin binding — EIP-712 offers
    // none — so any site that gets it signed can spend the wallet, permanently
    // and on every chain. That is the one fact a user needs before approving,
    // so it goes in `warn` rather than the muted footnote.
    deriving: {
      title: "check your wallet",
      body: "sign the EIP-712 message to derive your shielded key.",
      warn: "this signature IS your shielded spending key. only ever sign it here — check the address bar. any site that gets it can spend your funds.",
      note: "no funds move now. the signature is used locally to derive your key.",
    },
    noDepositReason:
      "This wallet's chain connection cannot sign transactions, so it cannot deposit.",
  },

  // EIP-6963 discovery decides whether any are actually installed; the kind
  // itself is always on offer.
  available: () => true,

  // Memoised on the store's primitives; `provider` is stable for a connection's
  // life. Identity matters: `useSession` passes `snapshot.layer` through to
  // `useBuildWallet`'s effect deps, so a fresh object per render re-runs that
  // effect, aborting the build and reopening the derivation prompt — without
  // bound, since a rejected prompt sets state.
  useSnapshot(): KindSnapshot {
    const status = useStore(eip1193Store, (s) => s.status);
    const address = useStore(eip1193Store, (s) => s.address);
    const chainId = useStore(eip1193Store, (s) => s.chainId);
    const provider = useStore(eip1193Store, (s) => s.provider);
    const error = useStore(eip1193Store, (s) => s.error);

    return useMemo<KindSnapshot>(() => {
      const connected = status === "connected" && !!address;
      return {
        connected,
        connecting: status === "connecting",
        error: status === "error" ? error : undefined,
        accountKey: connected ? address : undefined,
        ethAddress: connected ? address : undefined,
        chainId: chainId === undefined ? undefined : BigInt(chainId),
        layer:
          connected && provider && address && chainId !== undefined
            ? { kind: "eip1193", provider, address }
            : undefined,
      };
    }, [status, address, chainId, provider, error]);
  },

  /// `rdns` names which installed extension to latch. Absent, the store waits
  /// out the announce window and picks; that is the zero-or-one-wallet case,
  /// where there is nothing to disambiguate.
  attach: (rdns) => void eip1193Store.connect(rdns),
  disconnect: () => eip1193Store.disconnect(),

  /// Fire-and-forget with a toast; also what `useSwitchChain` hands out.
  switchChain(target: ChainEntry) {
    log.debug("switch requested", { to: target.chainId.toString() });
    void eip1193Store.switchChain(target).catch((err) => {
      log.warn("switch failed", err);
      toastError("network switch failed", err);
    });
  },

  keySource(layer, chain) {
    if (layer.kind !== "eip1193") throw new Error("eip1193Kind: wrong layer");
    const signer = withNonceSync(
      new Eip1193Signer(layer.provider, evmAddress(layer.address), chain.chainId),
      layer.provider,
    );
    return {
      signer,
      derive: () => deriveNskFromSigner(signer),
      prompt: "an EIP-712 signature",
    };
  },
};
