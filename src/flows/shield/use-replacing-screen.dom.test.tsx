import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReplacingScreen } from "./use-replacing-screen";

let api: ReturnType<typeof useReplacingScreen<HTMLButtonElement>>;

function Harness() {
  api = useReplacingScreen<HTMLButtonElement>();
  return (
    <>
      <button type="button" ref={api.triggerRef}>
        trigger
      </button>
      <button type="button">elsewhere</button>
    </>
  );
}

describe("useReplacingScreen", () => {
  it("leaves focus alone on mount, and returns it to the trigger on close", () => {
    render(<Harness />);
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    elsewhere.focus();
    expect(document.activeElement).toBe(elsewhere);

    act(() => api.show());
    expect(api.open).toBe(true);
    expect(document.activeElement).toBe(elsewhere);

    act(() => api.close());
    expect(api.open).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "trigger" }));
  });
});
