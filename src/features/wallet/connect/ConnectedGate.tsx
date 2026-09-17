import type { WalletApi } from "@lelantos-org/sdk";
import { type ReactNode, useEffect, useState } from "react";
import { useWallet } from "../session/context";
import { Welcome } from "./Welcome";
import "./ConnectedGate.css";

export interface ConnectedView {
  wallet: WalletApi;
  /// `Welcome` is still in the tree, fading out.
  welcomeMounted: boolean;
}

export function ConnectedGate({ children }: { children(view: ConnectedView): ReactNode }) {
  const { wallet, status } = useWallet();
  const ready = status === "ready" && !!wallet;
  const welcomeMounted = useWelcomeFade(ready);

  return (
    <div className="home-wrap">
      {ready && wallet ? children({ wallet, welcomeMounted }) : null}

      {welcomeMounted ? (
        <div className={`welcome-fade${ready ? " welcome-fade--out" : ""}`}>
          <Welcome />
        </div>
      ) : null}
    </div>
  );
}

/// Must equal the `.welcome-fade` transition in `ConnectedGate.css`, or the fade pops.
const TRANSITION_MS = 420;

/// Whether `Welcome` should still be mounted, kept briefly after `ready` so the cross-fade completes.
function useWelcomeFade(ready: boolean): boolean {
  const [mounted, setMounted] = useState(!ready);
  useEffect(() => {
    if (ready) {
      const id = setTimeout(() => setMounted(false), TRANSITION_MS);
      return () => clearTimeout(id);
    }
    setMounted(true);
    return undefined;
  }, [ready]);
  return mounted;
}
