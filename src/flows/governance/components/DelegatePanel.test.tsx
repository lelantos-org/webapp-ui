// @vitest-environment jsdom

import { evmAddress } from "@lelantos-org/sdk";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { routerWrapper } from "@/test/render";
import { DelegatePanel, type DelegatePanelProps, delegateLabel } from "./DelegatePanel";

vi.mock("@/features/chain", () => ({ useTxExplorerUrl: () => () => "https://explorer/tx" }));

const ME = evmAddress("0x1111111111111111111111111111111111111111");
const OTHER = "0x2222222222222222222222222222222222222222";
const ZERO = "0x0000000000000000000000000000000000000000";

function renderPanel(over: Partial<DelegatePanelProps> = {}) {
  const onDelegate = vi.fn();
  render(
    <DelegatePanel
      account={ME}
      currentDelegate={ZERO}
      canSign
      onDelegate={onDelegate}
      tx={{ status: "idle", error: null, hash: undefined, reset: vi.fn() }}
      {...over}
    />,
    { wrapper: routerWrapper },
  );
  return { onDelegate };
}

describe("DelegatePanel", () => {
  it("says shielded LNT has no votes and delegation only counts going forward", () => {
    renderPanel();
    expect(screen.getByText(/shielded pool carries no voting power/)).toBeInTheDocument();
    expect(screen.getByText(/only for proposals created after it/)).toBeInTheDocument();
    expect(screen.getByText("Not delegated")).toBeInTheDocument();
  });

  it("delegates to self in one click", () => {
    const { onDelegate } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Delegate to myself" }));
    expect(onDelegate).toHaveBeenCalledWith(ME);
  });

  it("offers no self-delegation to an account already delegating to itself", () => {
    renderPanel({ currentDelegate: ME.toLowerCase() });
    expect(screen.getByText("Yourself")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delegate to myself" })).toBeNull();
  });

  it("rejects an address that is not one", async () => {
    const { onDelegate } = renderPanel();
    fireEvent.change(screen.getByLabelText(/another address/), { target: { value: "0x123" } });
    fireEvent.click(screen.getByRole("button", { name: "Delegate" }));
    expect(await screen.findByText("Enter a 0x address")).toBeInTheDocument();
    expect(onDelegate).not.toHaveBeenCalled();
  });

  it("delegates to a typed address", async () => {
    const { onDelegate } = renderPanel({ currentDelegate: OTHER });
    fireEvent.change(screen.getByLabelText(/another address/), {
      target: { value: ` ${OTHER} ` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delegate" }));
    await waitFor(() => expect(onDelegate).toHaveBeenCalledWith(evmAddress(OTHER)));
  });

  it("is read-only for a session that cannot sign", () => {
    renderPanel({ canSign: false, signerReason: "Connect a browser wallet." });
    expect(screen.getByText("Connect a browser wallet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delegate to myself" })).toBeNull();
  });

  it("shows the settled transaction, and Done returns to the form", () => {
    const reset = vi.fn();
    renderPanel({ tx: { status: "success", error: null, hash: `0x${"ab".repeat(32)}`, reset } });
    expect(screen.getByText("Delegation updated")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explorer/ })).toHaveAttribute(
      "href",
      "https://explorer/tx",
    );
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(reset).toHaveBeenCalled();
  });
});

describe("delegateLabel", () => {
  it("names who the votes go through", () => {
    expect(delegateLabel(undefined, ME)).toBe("…");
    expect(delegateLabel("0x0000000000000000000000000000000000000000", ME)).toBe("Not delegated");
    expect(delegateLabel(ME.toLowerCase(), ME)).toBe("Yourself");
    expect(delegateLabel("0x2222222222222222222222222222222222222222", ME)).toBe("0x2222…2222");
    expect(delegateLabel(OTHER, undefined)).toBe("0x2222…2222");
  });
});
