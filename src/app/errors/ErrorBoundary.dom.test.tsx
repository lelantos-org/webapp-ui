import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { reloadPage } from "@/shared/lib/reload";
import { chooseEndpoints } from "@/test/endpoints";
import { press } from "@/test/interact";
import { ErrorBoundary } from "./ErrorBoundary";

vi.mock("@/shared/lib/reload", () => ({ reloadPage: vi.fn() }));

function Throws({ error }: { error: Error }): never {
  throw error;
}

function renderCrash(error: Error) {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <Throws error={error} />
    </ErrorBoundary>,
  );
  return screen.getByText("Something broke").closest(".card") as HTMLElement;
}

describe("ErrorBoundary default fallback", () => {
  it("states a short error's own message", () => {
    const card = renderCrash(new TypeError("Cannot read properties of undefined (reading 'id')"));
    expect(card.textContent).toContain("Cannot read properties of undefined (reading 'id')");
  });

  it("does not put a raw payload on the page", () => {
    const card = renderCrash(new Error(`decode failed for 0x${"cd".repeat(40)}`));
    expect(card.textContent).not.toMatch(/0x[0-9a-f]{8,}/i);
    expect(card.textContent).toContain("Something went wrong. Please try again.");
  });

  it("offers no endpoint reset on the build's own services", () => {
    renderCrash(new Error("boom"));
    expect(screen.queryByRole("button", { name: /reset network endpoints/ })).toBeNull();
  });

  it("offers the way back from an endpoint the user chose", () => {
    chooseEndpoints({ registryUrl: "https://registry.test" });
    renderCrash(new Error("boom"));

    press(/reset network endpoints/);

    expect(localStorage.getItem("lelantos:endpoints:v1")).toBeNull();
    expect(reloadPage).toHaveBeenCalledOnce();
  });
});
