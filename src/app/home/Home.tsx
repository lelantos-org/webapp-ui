import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ACTION_PREFETCH } from "@/app/routes/routes";
import { AssetsCard, PortfolioHero } from "@/features/assets";
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

/// `capability` names a gate in `deriveCapabilities`. Only Shield has one:
/// every other tile ends in a relayed spend, which any wallet can make.
///
/// Labels name what the user is doing, not what the protocol calls it:
/// `deposit` and `withdraw` are accurate about the pool and silent about the
/// thing that makes this wallet different — that the money crosses into, or out
/// of, the shielded side. The routes now say the same (`/shield`, `/unshield`);
/// the protocol-named paths redirect.
///
/// Send by link has no tile. It is for the case where the recipient has no
/// shielded address, which is a detail of sending, so it is reached from Send.
const TILES = [
  { to: "/shield", label: "Shield", icon: "shield", capability: "deposit", primary: true },
  { to: "/send", label: "Send", icon: "send" },
  { to: "/swap", label: "Swap", icon: "swap" },
  { to: "/unshield", label: "Unshield", icon: "unshield" },
] as const satisfies readonly {
  to: string;
  label: string;
  icon: ActionIconName;
  capability?: Capability;
  primary?: boolean;
}[];

/// Warms the route chunk and the prover together: reaching for a tile is the
/// first observable intent to transact, and every tile leads to a form ending in
/// a proof. Both calls are idempotent, so repeated hovers cost nothing. On touch
/// devices `pointerenter` fires on tap.
function warmTile(to: string): void {
  ACTION_PREFETCH[to]?.();
  void preloadProverWorker();
}

export function Home() {
  const { wallet, status, capabilities } = useWallet();
  const ready = status === "ready" && !!wallet;

  // Pre-warm the action chunks during idle time, avoiding a Suspense fallback on
  // the first tile click.
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
          {/* Hidden rather than shown: Home has no page title, and the balance is
              the visual anchor. But without an h1 the headings start at h2 with
              nothing above them — `Welcome`'s h1 unmounts on connect — so a
              screen reader gets a document with no name for the page it is on.
              Withheld until the cross-fade ends, because `Welcome` is still
              mounted with an h1 of its own until then. */}
          {welcomeMounted ? null : <h1 className="sr-only">Lelantos shielded wallet</h1>}
          {/* Order is the argument. The balance leads, because
              it is what someone opens the app to read; the actions follow,
              because that is what they came to do; then what makes up the
              balance; and last the address, which is reference material needed
              only when receiving. The Permit2 setup notice is not here: it gates
              a deposit, so it lives on the Shield screen. */}
          <PortfolioHero />
          {/* Tiles, each a link to its own screen. Shield is always the filled
              one — it is the first thing a new wallet can do and the only way
              anything gets in — not whichever route happens to be active. */}
          <nav className="tiles" aria-label="What to do">
            {TILES.map((t) => {
              // Disabled rather than hidden, and the route still renders: a
              // deep link to `/shield` reaches `DepositUnavailable`, which says
              // why. A missing tile would leave the same user nothing to read.
              const gate = "capability" in t ? capabilities[t.capability] : undefined;
              const primary = "primary" in t && t.primary;
              if (gate && !gate.allowed) {
                return (
                  <span
                    key={t.to}
                    className="tile tile--off"
                    aria-disabled="true"
                    title={gate.reason}
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
          <AssetsCard />
          <AccountCard shielded={wallet.address} />
          <Provenance />
        </div>
      )}
    </ConnectedGate>
  );
}
