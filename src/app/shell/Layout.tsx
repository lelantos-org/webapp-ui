import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { STANDALONE } from "@/app/routes/routes";
import { Backdrop } from "@/app/shell/chrome/Backdrop";
import { BetaBanner } from "@/app/shell/chrome/BetaBanner";
import { EndpointsButton } from "@/app/shell/chrome/EndpointsButton";
import { PrivacyToggle } from "@/app/shell/chrome/PrivacyToggle";
import { ThemeToggle } from "@/app/shell/chrome/ThemeToggle";
import { Wordmark } from "@/app/shell/chrome/Wordmark";
import { ChainBadge } from "@/features/chain";
import { ConnectButton, useWallet } from "@/features/wallet";
import { closeEndpointsDialog, useEndpointsDialogOpen } from "@/shared/hooks/use-endpoints-dialog";
import { cx } from "@/shared/lib/cx";
import { GithubIcon } from "@/shared/ui/icons/brand";
import { EndpointsModal } from "./endpoints/EndpointsModal";
import { HealthIndicator } from "./health/HealthIndicator";
import { InFlightNotice } from "./InFlightNotice";
import { InterruptedNotice } from "./InterruptedNotice";
import { useLeaveGuard } from "./use-leave-guard";
import { useScreenChange } from "./use-screen-change";
import "./Layout.css";

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { status } = useWallet();
  const endpointsOpen = useEndpointsDialogOpen();
  useScreenChange();
  useLeaveGuard();
  const standalone = STANDALONE.find((route) => route.path === pathname);
  const minimal = standalone !== undefined;
  const connected = status === "ready";
  // A connected app screen: the header carries every control.
  const full = connected && !minimal;
  return (
    <>
      {minimal ? null : <Backdrop />}
      <div className="app">
        <a className="skip" href="#main">
          Skip to content
        </a>
        {minimal || connected ? <BetaBanner /> : null}
        <header className="hdr">
          <div className="hdr__left">
            <Wordmark sub={standalone?.mark} />
          </div>
          <div className="hdr__right">
            {full ? (
              <span className="hdr__health">
                <HealthIndicator />
              </span>
            ) : null}
            {minimal || connected ? <ChainBadge /> : null}
            {full ? <ConnectButton /> : null}
            {/* Folded on a phone, where the account menu carries them. */}
            <span className={cx("hdr__tools", full && "hdr__tools--folds")}>
              {full ? <PrivacyToggle /> : null}
              {/* Not on a claim: saving reloads, and the link is gone from the address bar. A
                  profile keeps the same bare header. */}
              {minimal ? null : <EndpointsButton />}
              <ThemeToggle />
            </span>
          </div>
        </header>
        {endpointsOpen ? <EndpointsModal onClose={closeEndpointsDialog} /> : null}
        <InFlightNotice />
        <InterruptedNotice />
        <main className="main" id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="ftr">
          <span className="ftr__brand">Lelantos</span>
          <span className="ftr__sep" aria-hidden="true" />
          <span className="ftr__note">
            no cookies <span aria-hidden="true">🍪</span> · no tracking{" "}
            <span aria-hidden="true">👁️</span> · no accounts <span aria-hidden="true">👤</span>
          </span>
          <span className="ftr__sep" aria-hidden="true" />
          <a
            className="ftr__link"
            href="https://explorer.lelantos.xyz"
            target="_blank"
            rel="noopener noreferrer"
          >
            explorer
          </a>
          <span className="ftr__sep" aria-hidden="true" />
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
