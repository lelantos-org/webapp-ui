import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { HealthIndicator } from "@/features/system/HealthIndicator";
import { ConnectButton } from "@/features/wallet/ConnectButton";

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const minimal = pathname === "/claim";
  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr__left">
          <span className="brand">SILENTSWAP</span>
          <span className="brand__sub muted">{minimal ? "claim" : "wallet"}</span>
        </div>
        {minimal ? null : (
          <div className="hdr__right">
            <HealthIndicator />
            <ConnectButton />
          </div>
        )}
      </header>
      <main className="main">{children}</main>
      <footer className="ftr">
        <span className="ftr__brand">SilentSwap</span>
      </footer>
    </div>
  );
}
