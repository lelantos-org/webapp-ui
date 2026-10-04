import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROUTER_FUTURE } from "@/app/providers/router-future";
import { beginOp, opKey, opScope, resetOpsForTest, settleOp } from "@/features/tx";
import { InFlightNotice } from "./InFlightNotice";

vi.mock("@/features/wallet", () => ({ useWallet: () => ({ wallet: { address: "lelantos1me" } }) }));
vi.mock("@/features/chain", () => ({ useActiveChainOrUndefined: () => ({ chainId: 31337n }) }));

const SCOPE = opScope(31337n, "lelantos1me");
const start = (name: string, path: string) =>
  beginOp(opKey(SCOPE, name), { label: name, path, scope: SCOPE });

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <InFlightNotice />
    </MemoryRouter>,
  );

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
