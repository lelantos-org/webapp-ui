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
  chainSource: "wallet",

  copy: {
    label: () => "Browser wallet",
    // The signature IS the spending key and has no origin binding, so that risk goes in `warn`.
    deriving: {
      title: "check your wallet",
      body: "sign the EIP-712 message to derive your shielded key.",
      warn: "this signature IS your shielded spending key. only ever sign it here — check the address bar. any site that gets it can spend your funds.",
      note: "no funds move now. the signature is used locally to derive your key.",
    },
    noDepositReason:
      "This wallet's chain connection cannot sign transactions, so it cannot deposit.",
  },

  available: () => true,

  // Memoised: a fresh `layer` per render aborts the build and reopens the prompt, without bound.
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

  attach: (rdns) => void eip1193Store.connect(rdns),
  disconnect: () => eip1193Store.disconnect(),

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
