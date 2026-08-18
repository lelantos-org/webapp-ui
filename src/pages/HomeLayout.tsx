import { Fragment, Suspense, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { chainKey } from "@/config/chains";
import { AssetsCard } from "@/features/assets/AssetsCard";
import { useActiveChainOrUndefined } from "@/features/chain/ChainProvider";
import { useWallet } from "@/features/wallet";
import { AccountCard } from "@/features/wallet/AccountCard";
import { preloadProverWorker } from "@/features/wallet/prover/proverWorker";
import { Welcome } from "@/features/wallet/Welcome";

const PREFETCH: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/features/actions/forms/DepositForm"),
  "/transfer": () => import("@/features/actions/forms/TransferForm"),
  "/withdraw": () => import("@/features/actions/forms/WithdrawForm"),
  "/swap": () => import("@/features/swaps/SwapForm"),
  "/send-link": () => import("@/features/claim-link/GenerateLinkForm"),
};

const TABS = [
  { to: "/", label: "deposit", end: true, hidden: false },
  { to: "/transfer", label: "transfer", end: false, hidden: false },
  { to: "/withdraw", label: "withdraw", end: false, hidden: false },
  { to: "/swap", label: "swap", end: false, hidden: false },
  { to: "/send-link", label: "claim link", end: false, hidden: false },
] as const;

const TRANSITION_MS = 360;

/// Warms the route chunk and the prover together: reaching for a tab is the
/// first observable intent to transact, and every tab leads to a form ending in
/// a proof. Both calls are idempotent, so repeated hovers cost nothing. On
/// touch devices `pointerenter` fires on tap.
function warmTab(to: string): void {
  PREFETCH[to]?.();
  void preloadProverWorker();
}

function FormFallback() {
  return (
    <div role="status" aria-busy="true" aria-label="loading">
      <div className="skel skel--card" />
    </div>
  );
}

export function HomeLayout() {
  const { wallet, status, ethAddress } = useWallet();
  const chainId = useActiveChainOrUndefined()?.chainId;
  const ready = status === "ready" && !!wallet;

  // Keep <Welcome /> mounted briefly after `ready` flips so CSS opacity can
  // transition out. The connected layout renders simultaneously underneath
  // (grid-stacked), producing a cross-fade rather than a hard swap.
  const [welcomeMounted, setWelcomeMounted] = useState(!ready);
  useEffect(() => {
    if (ready) {
      const id = setTimeout(() => setWelcomeMounted(false), TRANSITION_MS);
      return () => clearTimeout(id);
    }
    setWelcomeMounted(true);
  }, [ready]);

  // Pre-warm tab chunks during idle time to avoid first-click Suspense flicker.
  useEffect(() => {
    if (!ready) return;
    const run = () => {
      for (const f of Object.values(PREFETCH)) f();
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run);
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(run, 0);
    return () => clearTimeout(id);
  }, [ready]);

  return (
    <div className="home-wrap">
      {ready && wallet ? (
        <div className="home stack home--enter">
          <AccountCard shielded={wallet.address} eth={ethAddress} />
          <AssetsCard />
          <div className="action-shell">
            <nav className="action-shell__tabs seg">
              {TABS.filter((t) => !t.hidden).map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  onPointerEnter={() => warmTab(t.to)}
                  onFocus={() => warmTab(t.to)}
                  className={({ isActive }) => `seg__b ${isActive ? "seg__b--on" : ""}`}
                >
                  {t.label}
                </NavLink>
              ))}
            </nav>
            <div className="action-shell__body">
              <Suspense fallback={<FormFallback />}>
                {/* Keyed on the chain so a network switch recreates the form's
                    react-hook-form state instead of carrying it across.
                    Asset ids are only unique *within* a chain, so a retained
                    `asset` silently rebinds: id 3 as USDC (6dp) on one chain
                    becomes WBTC (8dp) on the next, and `findAsset` resolves it
                    happily. `asEth` is worse — it survives to a chain with no
                    `nativeAdapterAddress`, where `AssetPicker` renders no eth
                    option at all, so the select shows the first token while the
                    form still holds `asEth: true`. */}
                <Fragment key={chainId === undefined ? "no-chain" : chainKey(chainId)}>
                  <Outlet />
                </Fragment>
              </Suspense>
            </div>
          </div>
        </div>
      ) : null}

      {welcomeMounted ? (
        <div className={`welcome-fade${ready ? " welcome-fade--out" : ""}`}>
          <Welcome />
        </div>
      ) : null}
    </div>
  );
}
