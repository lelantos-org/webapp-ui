import { Fragment, Suspense, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { chainKey } from "@/config/chains";
import { AssetsCard } from "@/features/assets";
import { useActiveChainOrUndefined } from "@/features/chain";
import { SetupAllNotice } from "@/features/onboarding";
import { AccountCard, preloadProverWorker, useWallet, Welcome } from "@/features/wallet";
import { Notice } from "@/shared/ui/Notice";
import { useChainChangeNotice } from "./use-chain-change-notice";

const PREFETCH: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/features/actions/forms/DepositForm"),
  "/transfer": () => import("@/features/actions/forms/TransferForm"),
  "/withdraw": () => import("@/features/actions/forms/WithdrawForm"),
  "/swap": () => import("@/features/swaps/SwapForm"),
  "/send-link": () => import("@/features/claim-link/GenerateLinkForm"),
};

const TABS = [
  { to: "/", label: "deposit", end: true },
  { to: "/transfer", label: "transfer", end: false },
  { to: "/withdraw", label: "withdraw", end: false },
  { to: "/swap", label: "swap", end: false },
  { to: "/send-link", label: "claim link", end: false },
] as const;

const TRANSITION_MS = 360;

/// Warms the route chunk and the prover together: reaching for a tab is the first
/// observable intent to transact, and every tab leads to a form ending in a
/// proof. Both calls are idempotent, so repeated hovers cost nothing. On touch
/// devices `pointerenter` fires on tap.
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
  const chain = useActiveChainOrUndefined();
  const chainId = chain?.chainId;
  const ready = status === "ready" && !!wallet;

  // Names the network just left, for a few seconds after a switch. The form
  // below is recreated on that switch — see the `<Fragment key>` comment — so
  // without this the user's typed input disappears with nothing said about it.
  const leftChain = useChainChangeNotice(
    chain ? { key: chainKey(chain.chainId), name: chain.chainName } : undefined,
  );

  // Keep `<Welcome />` mounted briefly after `ready` flips, so the CSS opacity
  // transition can complete. The connected layout renders underneath in the same
  // grid cell, producing a cross-fade rather than a hard swap.
  const [welcomeMounted, setWelcomeMounted] = useState(!ready);
  useEffect(() => {
    if (ready) {
      const id = setTimeout(() => setWelcomeMounted(false), TRANSITION_MS);
      return () => clearTimeout(id);
    }
    setWelcomeMounted(true);
  }, [ready]);

  // Pre-warm tab chunks during idle time, avoiding a Suspense fallback on the
  // first click.
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
          {/* Hidden rather than shown: the design has no page title, and
              `AccountCard` is the visual anchor. But without an h1 the
              connected route's headings start at h2 with nothing above them —
              `Welcome`'s h1 unmounts on connect — so a screen reader gets a
              document with no name for the page it is on.
              Withheld until the cross-fade ends, because `Welcome` is still
              mounted with an h1 of its own until then and the document would
              briefly claim two. */}
          {welcomeMounted ? null : <h1 className="sr-only">Lelantos shielded wallet</h1>}
          <AccountCard shielded={wallet.address} eth={ethAddress} />
          {/* Above the portfolio: this gates every ERC-20 deposit, so it is
              the first thing worth acting on. Rendered here rather than inside
              a feature card because `onboarding` already depends on `assets`,
              and reaching back the other way would close a barrel cycle. */}
          <SetupAllNotice />
          <AssetsCard />
          <div className="action-shell">
            <nav className="action-shell__tabs seg">
              {TABS.map((t) => (
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
              {leftChain ? (
                <Notice title="Network changed">
                  the form was reset — amounts and assets belong to the network they were entered
                  on. you were on {leftChain}.
                </Notice>
              ) : null}
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
