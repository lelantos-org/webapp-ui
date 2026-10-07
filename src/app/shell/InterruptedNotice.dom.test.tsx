import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type InterruptedOp, opScope, reloadInterruptedForTest } from "@/features/tx";
import { fakeWalletApi } from "@/features/wallet/testing";
import { SESSION_KEYS } from "@/shared/lib/storage/keys";
import { sessionStore, writeJson } from "@/shared/lib/storage/safe";
import { renderApp } from "@/test/app";
import { press } from "@/test/interact";
import { InterruptedNotice } from "./InterruptedNotice";

const SCOPE = opScope(31337n, "lelantos1me");

const op = (over: Partial<InterruptedOp> = {}): InterruptedOp => ({
  label: "transfer",
  path: "/send",
  scope: SCOPE,
  maybeSent: true,
  at: Date.now(),
  ...over,
});

/// Render the notice as the page that loads after `ops` were cut short.
function reloadedAt(path: string, ops: InterruptedOp[]) {
  writeJson(sessionStore, SESSION_KEYS.opsRunning, ops);
  reloadInterruptedForTest();
  return renderApp(<InterruptedNotice />, {
    route: path,
    chain: { chainId: 31337n },
    wallet: { wallet: fakeWalletApi({ address: "lelantos1me" }) },
  });
}

describe("InterruptedNotice", () => {
  it("is absent when no reload cut anything short", () => {
    reloadedAt("/", []);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("warns that a handed-over transaction may still go through, and leads back to it", () => {
    reloadedAt("/", [op()]);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Your transfer was interrupted by a page reload");
    expect(notice).toHaveTextContent("check your balance before sending again");
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/send");
  });

  it("says nothing moved when the reload came before the handover", () => {
    reloadedAt("/", [op({ maybeSent: false })]);
    expect(screen.getByRole("status")).toHaveTextContent("Nothing moved");
  });

  it("takes the cautious line for several when any may have been sent", () => {
    reloadedAt("/", [op({ maybeSent: false }), op({ label: "swap", path: "/swap" })]);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Transactions were interrupted");
    expect(notice).toHaveTextContent("check your balance");
    expect(screen.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
  });

  it("offers no way back on the transaction's own screen", () => {
    reloadedAt("/send", [op()]);
    expect(screen.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
  });

  it("goes once dismissed", () => {
    reloadedAt("/", [op()]);
    press("Dismiss");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps another account's interrupted transaction to that account", () => {
    reloadedAt("/", [op({ scope: opScope(31337n, "lelantos1other") })]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
