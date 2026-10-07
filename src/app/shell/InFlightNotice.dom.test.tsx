import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { beginOp, opKey, opScope, resetOpsForTest, settleOp } from "@/features/tx";
import { fakeWalletApi } from "@/features/wallet/testing";
import { renderApp } from "@/test/app";
import { InFlightNotice } from "./InFlightNotice";

const SCOPE = opScope(31337n, "lelantos1me");
const start = (name: string, path: string) =>
  beginOp(opKey(SCOPE, name), { label: name, path, scope: SCOPE });

const at = (path: string) =>
  renderApp(<InFlightNotice />, {
    route: path,
    chain: { chainId: 31337n },
    wallet: { wallet: fakeWalletApi({ address: "lelantos1me" }) },
  });

beforeEach(() => resetOpsForTest());

describe("InFlightNotice", () => {
  it("is absent with nothing in flight", () => {
    at("/");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("leads back to an op left running on another screen", () => {
    start("transfer", "/send");
    at("/");
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Your transfer is still in progress");
    expect(notice).toHaveAttribute("href", "/send");
  });

  it("steps aside on the op's own screen, where the progress card shows it", () => {
    start("transfer", "/send");
    at("/send");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("counts several, and goes once they end", () => {
    start("transfer", "/send");
    start("swap", "/swap");
    at("/");
    expect(screen.getByRole("status")).toHaveTextContent("2 transactions are still in progress");

    act(() => {
      settleOp(opKey(SCOPE, "transfer"), {});
      settleOp(opKey(SCOPE, "swap"), {});
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
