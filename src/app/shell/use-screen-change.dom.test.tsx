import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROUTER_FUTURE } from "@/app/providers/router-future";
import { useScreenChange } from "./use-screen-change";

let navigate: ReturnType<typeof useNavigate>;

function Screen() {
  useScreenChange();
  navigate = useNavigate();
  return (
    <main id="main" tabIndex={-1}>
      <button type="button">inside</button>
    </main>
  );
}

function mount(path: string) {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <Screen />
    </MemoryRouter>,
  );
  return scrollTo;
}

afterEach(() => vi.restoreAllMocks());

describe("useScreenChange", () => {
  it("titles the first screen and leaves scroll and focus to the page load", () => {
    const scrollTo = mount("/shield");
    expect(document.title).toBe("Shield · Lelantos Wallet");
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it("starts a new screen at the top, focused and titled", () => {
    const scrollTo = mount("/");
    act(() => navigate("/send"));
    expect(document.title).toBe("Send · Lelantos Wallet");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(document.activeElement).toBe(document.getElementById("main"));
  });

  it("keeps the restored scroll position on back", () => {
    const scrollTo = mount("/");
    act(() => navigate("/send"));
    scrollTo.mockClear();
    act(() => navigate(-1));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.title).toBe("Lelantos Wallet");
  });
});
