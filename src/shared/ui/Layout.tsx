import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ChainBadge } from "@/features/chain/ChainBadge";
import { HealthIndicator } from "@/features/system/HealthIndicator";
import { ConnectButton } from "@/features/wallet/ConnectButton";
import { Backdrop } from "@/shared/ui/Backdrop";

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" role="img">
      <title>GitHub</title>
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49l-.01-1.72c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 2.5-.34c.85 0 1.71.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.35 4.8-4.58 5.05.36.32.68.94.68 1.9l-.01 2.82c0 .27.18.59.69.49A10.06 10.06 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const minimal = pathname === "/claim";
  return (
    <>
      <Backdrop />
      <div className="app">
        <header className="hdr">
          <div className="hdr__left">
            <span className="brand">LELANTOS</span>
            <span className="brand__sub muted">{minimal ? "claim" : "wallet"}</span>
          </div>
          {minimal ? null : (
            <div className="hdr__right">
              {/* Health and network are one question — "connected, and to
                  what" — so they share a pill rather than sitting as two
                  separate widgets competing for the same glance. */}
              <span className="pill hdr__status">
                <HealthIndicator />
                <ChainBadge />
              </span>
              <ConnectButton />
            </div>
          )}
        </header>
        <main className="main">{children}</main>
        <footer className="ftr">
          <span className="ftr__brand">Lelantos</span>
          <span className="ftr__sep" aria-hidden="true" />
          <span className="muted">no cookies 🍪 · no tracking 👁️ · no accounts 👤</span>
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
