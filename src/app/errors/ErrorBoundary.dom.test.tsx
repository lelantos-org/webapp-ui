import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

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
});
