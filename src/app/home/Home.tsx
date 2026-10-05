import { useEffect, useId } from "react";
import { Link } from "react-router-dom";
import { ACTION_PREFETCH } from "@/app/routes/routes";
import { AssetsCard, PortfolioHero } from "@/features/assets";
import { useActiveChainOrUndefined } from "@/features/chain";
import {
  AccountCard,
  type Capability,
  ConnectedGate,
  preloadProverWorker,
  useWallet,
} from "@/features/wallet";
import { cx } from "@/shared/lib/cx";
import { whenIdle } from "@/shared/lib/when-idle";
import { ActionIcon, type ActionIconName } from "./ActionIcon";
import { Provenance } from "./Provenance";
import "./Home.css";
const TILES = [
  { to: "/shield", label: "Shield", icon: "shield", capability: "deposit", primary: true },
  { to: "/send", label: "Send", icon: "send" },
  { to: "/swap", label: "Swap", icon: "swap" },
  { to: "/unshield", label: "Unshield", icon: "unshield" },
  { to: "/governance", label: "Governance", icon: "govern", needsGovernor: true },
] as const satisfies readonly {
  to: string;
  label: string;
  icon: ActionIconName;
  capability?: Capability;
  primary?: boolean;
  needsGovernor?: boolean;
}[];

function warmTile(to: string): void {
  ACTION_PREFETCH[to]?.();
  void preloadProverWorker();
}

export function Home() {
  const { wallet, status, capabilities } = useWallet();
  const ready = status === "ready" && !!wallet;
  const governed = !!useActiveChainOrUndefined()?.governorAddress;
  const tiles = TILES.filter((t) => !("needsGovernor" in t) || governed);
  const gateOf = (t: (typeof TILES)[number]) =>
    "capability" in t ? capabilities[t.capability] : undefined;
  const offWhyId = useId();
  const offReason = tiles.map(gateOf).find((g) => g && !g.allowed)?.reason;

  useEffect(() => {
    if (!ready) return;
    return whenIdle(() => {
      for (const f of Object.values(ACTION_PREFETCH)) f();
    });
  }, [ready]);

  return (
    <ConnectedGate>
      {({ wallet, welcomeMounted }) => (
        <div className="home gate-enter">
          {/* Withheld until Welcome's own h1 unmounts. */}
          {welcomeMounted ? null : <h1 className="sr-only">Lelantos shielded wallet</h1>}
          <PortfolioHero />
          <nav
            className={cx(
              "tiles",
              tiles.length === 5 && "tiles--five",
              tiles.length >= 6 && "tiles--six",
            )}
            aria-label="What to do"
          >
            {tiles.map((t) => {
              const gate = gateOf(t);
              const primary = "primary" in t && t.primary;
              if (gate && !gate.allowed) {
                return (
                  <span
                    key={t.to}
                    className="tile tile--off"
                    aria-disabled="true"
                    aria-describedby={offWhyId}
                  >
                    <ActionIcon name={t.icon} />
                    {t.label}
                  </span>
                );
              }
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  onPointerEnter={() => warmTile(t.to)}
                  onFocus={() => warmTile(t.to)}
                  className={cx("tile", primary && "tile--primary")}
                >
                  <ActionIcon name={t.icon} />
                  {t.label}
                </Link>
              );
            })}
          </nav>
          {/* In the page, not a `title`: a tooltip never shows on touch. */}
          {offReason ? (
            <p className="footnote tiles__why" id={offWhyId}>
              {offReason}
            </p>
          ) : null}
          <AssetsCard />
          <AccountCard shielded={wallet.address} />
          <Provenance />
        </div>
      )}
    </ConnectedGate>
  );
}
