// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailsDisclosure } from "@/shared/ui/DetailsDisclosure";

const row = () => screen.getByRole("button", { name: /Details/ });

describe("DetailsDisclosure", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("states the answer while collapsed, with the itemisation out of the tree", () => {
    render(
      <DetailsDisclosure summary="Total fees 0.25 USDC · paid in USDC">
        <span>Relayer fee</span>
      </DetailsDisclosure>,
    );
    expect(row()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Total fees 0.25 USDC · paid in USDC")).toBeInTheDocument();
    expect(screen.queryByText("Relayer fee")).not.toBeInTheDocument();
  });

  it("opens and closes on the row, pointing the button at what it controls", () => {
    vi.useFakeTimers();
    render(
      <DetailsDisclosure summary="x">
        <span>Relayer fee</span>
      </DetailsDisclosure>,
    );
    fireEvent.click(row());
    expect(row()).toHaveAttribute("aria-expanded", "true");
    const body = screen.getByText("Relayer fee").closest(".collapse");
    expect(row()).toHaveAttribute("aria-controls", body?.id);

    fireEvent.click(row());
    expect(row()).toHaveAttribute("aria-expanded", "false");
    // Held through the collapse, then removed so nothing inside stays tabbable.
    act(() => vi.advanceTimersByTime(260));
    expect(screen.queryByText("Relayer fee")).not.toBeInTheDocument();
  });

  it("opens itself when a problem appears, and can still be closed", () => {
    const { rerender } = render(
      <DetailsDisclosure summary="x">
        <span>body</span>
      </DetailsDisclosure>,
    );
    rerender(
      <DetailsDisclosure summary="x" tone="warn" forceOpen>
        <span>body</span>
      </DetailsDisclosure>,
    );
    expect(row()).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(row());
    expect(row()).toHaveAttribute("aria-expanded", "false");
  });
});
