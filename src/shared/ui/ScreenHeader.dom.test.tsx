import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { press } from "@/test/interact";
import { routerWrapper } from "@/test/render";

describe("ScreenHeader", () => {
  it("names the page and links back home", () => {
    render(<ScreenHeader title="Send privately" subtitle="Stays inside the pool" />, {
      wrapper: routerWrapper,
    });
    expect(screen.getByRole("heading", { level: 1, name: "Send privately" })).toBeInTheDocument();
    expect(screen.getByText("Stays inside the pool")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
  });

  it("stays on the route when back is a handler, and shows the step", () => {
    const onBack = vi.fn();
    render(
      <ScreenHeader
        title="Review"
        right="STEP 2 OF 2"
        onBack={onBack}
        backLabel="Back to the form"
      />,
      { wrapper: routerWrapper },
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    press("Back to the form");
    expect(onBack).toHaveBeenCalledOnce();
    expect(screen.getByText("STEP 2 OF 2")).toBeInTheDocument();
  });
});
