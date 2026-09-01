import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HealthIndicator } from "./HealthIndicator";

/// The accessible name and the painted colour live on different nodes: the
/// button carries the label and hit area, the span inside it carries the dot.
function dotInside(button: HTMLElement): HTMLElement {
  const dot = button.querySelector(".health__dot");
  if (!(dot instanceof HTMLElement)) throw new Error("no dot inside the health button");
  return dot;
}

const { health } = vi.hoisted(() => ({ health: vi.fn() }));

vi.mock("./use-system-health", () => ({ useSystemHealth: health }));

/// The dot's colour is written as a CSS custom property name inside an inline
/// style, which puts it outside everything that normally catches a typo: the
/// compiler sees a string, Biome sees a string, and an undefined property
/// resolves to nothing at paint time rather than erroring. The regression this
/// guards is exactly that — `var(--muted)` shipped here, and since `unknown` is
/// the state before the health query resolves, the dot was invisible on every
/// first paint rather than in some rare branch.
describe("HealthIndicator", () => {
  it("paints a defined token in the pre-load unknown state", () => {
    health.mockReturnValue({ data: undefined });

    render(<HealthIndicator />);
    const dot = dotInside(screen.getByRole("button", { name: "relayer: unknown, fmd: unknown" }));

    expect(dot).toHaveStyle({ background: "var(--fg-mute)" });
  });

  it.each([
    ["up" as const, "var(--accent)"],
    ["down" as const, "var(--err)"],
  ])("paints a defined token when both services are %s", (state, token) => {
    health.mockReturnValue({ data: { relayer: state, fmd: state } });

    render(<HealthIndicator />);
    const dot = dotInside(screen.getByRole("button", { name: `relayer: ${state}, fmd: ${state}` }));

    expect(dot).toHaveStyle({ background: token });
  });

  it("degrades to down when either service is down", () => {
    health.mockReturnValue({ data: { relayer: "up", fmd: "down" } });

    render(<HealthIndicator />);

    expect(dotInside(screen.getByRole("button", { name: "relayer: up, fmd: down" }))).toHaveStyle({
      background: "var(--err)",
    });
  });

  /// The stylesheet reveals the per-service breakdown on `.health:focus-within`,
  /// which only ever matches if something inside is focusable. It was a span, so
  /// that rule was dead and the breakdown was pointer-only.
  it("puts the breakdown behind a focusable control that describes it", () => {
    health.mockReturnValue({ data: { relayer: "up", fmd: "down" } });

    render(<HealthIndicator />);
    const trigger = screen.getByRole("button", { name: "relayer: up, fmd: down" });
    trigger.focus();

    expect(trigger).toHaveFocus();
    const tooltip = document.getElementById(trigger.getAttribute("aria-describedby") ?? "");
    expect(tooltip).toHaveAttribute("role", "tooltip");
    expect(tooltip).toHaveTextContent("relayer");
    expect(tooltip).toHaveTextContent("fmd");
  });
});
