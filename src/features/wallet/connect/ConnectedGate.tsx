// The connection gate Home and every action screen sit behind.
//
// Nothing below it renders until a wallet is connected on a supported chain —
// so everything there may call `useActiveChain`, which throws otherwise — and
// until then `Welcome` holds the column. The two share one grid cell
// (`.home-wrap`) and cross-fade on connect rather than swapping hard.

import type { WalletApi } from "@lelantos-org/sdk";
import { type ReactNode, useEffect, useState } from "react";
import { useWallet } from "../session/context";
import { Welcome } from "./Welcome";
import "./ConnectedGate.css";

export interface ConnectedView {
  wallet: WalletApi;
  /// `Welcome` is still in the tree, fading out. Home withholds its hidden page
  /// title meanwhile, since `Welcome` carries an h1 of its own.
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

/// Cross-fade duration between `Welcome` and the connected view. Must equal the
/// `.welcome-fade` transition in `ConnectedGate.css` (`--dur-420`): shorter
/// unmounts `Welcome` before its fade finishes, and the last frames pop.
const TRANSITION_MS = 420;

/// Whether `Welcome` should still be in the tree.
///
/// Kept mounted briefly after `ready` flips, so the CSS opacity transition can
/// complete. The connected view renders underneath in the same grid cell
/// (`.home-wrap`), producing a cross-fade rather than a hard swap. Shared by Home
/// and every action screen, which gate on the same connection; it lives beside
/// `Welcome` because that is the only thing it times.
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
