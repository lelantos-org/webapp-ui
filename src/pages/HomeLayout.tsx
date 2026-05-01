import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { AssetsCard } from "@/features/assets/AssetsCard";
import { useWallet } from "@/features/wallet";
import { AccountCard } from "@/features/wallet/AccountCard";
import { Welcome } from "@/features/wallet/Welcome";

const PREFETCH: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/features/actions/DepositForm"),
  "/transfer": () => import("@/features/actions/TransferForm"),
  "/withdraw": () => import("@/features/actions/WithdrawForm"),
  "/swap": () => import("@/features/swaps/SwapForm"),
  "/send-link": () => import("@/features/claim-link/GenerateLinkForm"),
};

const TABS = [
  { to: "/", label: "deposit", end: true, hidden: false },
  { to: "/transfer", label: "transfer", end: false, hidden: true },
  { to: "/withdraw", label: "withdraw", end: false, hidden: false },
  { to: "/swap", label: "swap", end: false, hidden: false },
  { to: "/send-link", label: "claim link", end: false, hidden: true },
] as const;

const TRANSITION_MS = 360;

function FormFallback() {
  return (
    <div role="status" aria-busy="true" aria-label="loading">
      <div className="skel skel--card" />
    </div>
  );
}

export function HomeLayout() {
  const { wallet, status, ethAddress } = useWallet();
  const ready = status === "ready" && !!wallet;

  // Keep <Welcome /> mounted briefly after `ready` flips so CSS opacity can
  // transition out. The connected layout renders simultaneously underneath
  // (grid-stacked), producing a cross-fade instead of a hard swap.
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
                  onPointerEnter={() => PREFETCH[t.to]?.()}
                  onFocus={() => PREFETCH[t.to]?.()}
                  className={({ isActive }) => `seg__b ${isActive ? "seg__b--on" : ""}`}
                >
                  {t.label}
                </NavLink>
              ))}
            </nav>
            <div className="action-shell__body">
              <Suspense fallback={<FormFallback />}>
                <Outlet />
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
