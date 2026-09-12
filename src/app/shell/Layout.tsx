// The application shell: banner, header and the slot every route renders into.
//
// In `app/` rather than `shared/ui/` because it composes features — `chain`,
// `wallet` and the health probe — which is composition-root work, the same job
// `providers.tsx` does. `shared/` is the floor everything else stands on, so a
// module there reaching up into a feature inverts the layering and is how a
// cycle gets introduced later. Every other file in `shared/ui/` is
// feature-agnostic; this one never was.

import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ChainBadge } from "@/features/chain";
import { ConnectButton, useWallet } from "@/features/wallet";
import { Backdrop } from "@/shared/ui/Backdrop";
import { BetaBanner } from "@/shared/ui/BetaBanner";
import { GithubIcon } from "@/shared/ui/glyphs";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { Wordmark } from "@/shared/ui/Wordmark";
import { HealthIndicator } from "./HealthIndicator";
import "./Layout.css";

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { status } = useWallet();
  const minimal = pathname === "/claim";
  // Status pills only once there is a session to describe. Before that the
  // Welcome card owns the connection, so a second "connect wallet" and a lone
  // health dot in the bar would be the same control twice and a status nobody
  // asked about.
  const connected = status === "ready";
  return (
    <>
      {/* Omitted on /claim: that route builds an ephemeral wallet and syncs,
          the heaviest main-thread work in the app, and carries its own
          gradient backdrop. */}
      {minimal ? null : <Backdrop />}
      <div className="app">
        {/* The banner, brand, status pills and account control all precede the
            content on every route, so a keyboard or screen-reader user crosses
            them before reaching anything they came for. */}
        <a className="skip" href="#main">
          Skip to content
        </a>
        {/* Above the header, and on `/claim` too: that route is where someone
            who has never seen the app arrives holding a link to real funds. */}
        <BetaBanner />
        <header className="hdr">
          <div className="hdr__left">
            <Wordmark sub={minimal ? "claim" : undefined} />
          </div>
          <div className="hdr__right">
            {/* `/claim` keeps the network pill and drops the rest. A wrong
                network is the likeliest thing to go wrong on that route, and
                until the link is decoded *and* a wallet is connected
                `NetworkGateCard` cannot yet say so — leaving the arrival with no
                way to see where they are. The badge is a read-only label with
                no work behind it; health and account stay out, because the
                claim flow runs its own gate and its own status. */}
            {minimal ? (
              <ChainBadge />
            ) : connected ? (
              <>
                {/* Three pills, one question each — is it working, which
                    network, whose account. Phones keep the network and fold
                    the account into an avatar menu. */}
                <span className="hdr__health">
                  <HealthIndicator />
                </span>
                <ChainBadge />
                <ConnectButton />
              </>
            ) : null}
            {/* The light theme's only switch. On phones it moves into the
                avatar menu. */}
            <span className={connected && !minimal ? "hdr__theme hdr__theme--folds" : "hdr__theme"}>
              <ThemeToggle />
            </span>
          </div>
        </header>
        {/* `tabIndex={-1}` so the skip link can move focus here, not just
            scroll: without it the target is unfocusable and the next Tab
            resumes from the header the link was meant to skip. */}
        <main className="main" id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="ftr">
          <span className="ftr__brand">Lelantos</span>
          <span className="ftr__sep" aria-hidden="true" />
          {/* Hard-coded like the GitHub link beside it: this is the project's
              own explorer, not a per-deployment service. The `explorerUrl` a
              chain carries is a different thing — the block explorer its tx
              links point at. */}
          <a
            className="ftr__link"
            href="https://explorer.lelantos.xyz"
            target="_blank"
            rel="noopener noreferrer"
          >
            explorer
          </a>
          <span className="ftr__sep" aria-hidden="true" />
          {/* Which build is on screen — the first thing worth knowing about a
              bug report, and unanswerable from a hashed asset filename. */}
          <span className="ftr__ver mono muted" title="build commit">
            {__COMMIT__}
          </span>
          <span className="ftr__sep" aria-hidden="true" />
          <a
            className="ftr__link"
            href="https://github.com/lelantos-org"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Lelantos on GitHub"
          >
            <GithubIcon />
          </a>
        </footer>
      </div>
    </>
  );
}
