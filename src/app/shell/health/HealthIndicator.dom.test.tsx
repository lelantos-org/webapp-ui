import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HealthIndicator } from "./HealthIndicator";

function dotInside(button: HTMLElement): HTMLElement {
  const dot = button.querySelector(".health__dot");
  if (!(dot instanceof HTMLElement)) throw new Error("no dot inside the health button");
  return dot;
}

const { health } = vi.hoisted(() => ({ health: vi.fn() }));

vi.mock("./use-system-health", () => ({ useSystemHealth: health }));

// An undefined CSS var in an inline style paints nothing and nothing type-checks it.
describe("HealthIndicator", () => {
  it("paints a defined token in the pre-load unknown state", () => {
    health.mockReturnValue({ data: undefined });

    render(<HealthIndicator />);
    const dot = dotInside(
      screen.getByRole("button", {
        name: "registry: unknown, relayer: unknown, fmd: unknown",
      }),
    );

    expect(dot).toHaveStyle({ background: "var(--fg-mute)" });
  });

  it.each([
    ["up" as const, "var(--accent)"],
    ["down" as const, "var(--err)"],
  ])("paints a defined token when every service is %s", (state, token) => {
    health.mockReturnValue({ data: { registry: state, relayer: state, fmd: state } });

    render(<HealthIndicator />);
    const dot = dotInside(
      screen.getByRole("button", {
        name: `registry: ${state}, relayer: ${state}, fmd: ${state}`,
      }),
    );

    expect(dot).toHaveStyle({ background: token });
  });

  it("puts the breakdown behind a focusable control that describes it", () => {
    health.mockReturnValue({ data: { registry: "up", relayer: "up", fmd: "down" } });

    render(<HealthIndicator />);
    const trigger = screen.getByRole("button", {
      name: "registry: up, relayer: up, fmd: down",
    });
    trigger.focus();

    expect(trigger).toHaveFocus();
    const tooltip = document.getElementById(trigger.getAttribute("aria-describedby") ?? "");
    expect(tooltip).toHaveAttribute("role", "tooltip");
    expect(tooltip).toHaveTextContent("Registry");
    expect(tooltip).toHaveTextContent("Relayer");
    expect(tooltip).toHaveTextContent("Note feed");
  });

  it("says in words what the dot means", () => {
    health.mockReturnValue({ data: { registry: "up", relayer: "down", fmd: "up" } });

    render(<HealthIndicator />);

    expect(screen.getByText("Relayer unreachable")).toBeInTheDocument();
  });
});
