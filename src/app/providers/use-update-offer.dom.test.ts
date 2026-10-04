import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateOffer } from "./use-update-offer";

const h = vi.hoisted(() => ({
  mutating: 0,
  toast: Object.assign(
    vi.fn((_title: string, _opts: unknown) => "toast-1"),
    { dismiss: vi.fn() },
  ),
}));

vi.mock("@tanstack/react-query", () => ({ useIsMutating: () => h.mutating }));
vi.mock("sonner", () => ({ toast: h.toast }));

const reload = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  h.mutating = 0;
});

describe("useUpdateOffer", () => {
  it("offers the reload when a new build is waiting, and not before", () => {
    const { rerender } = renderHook(({ need }) => useUpdateOffer(need, reload), {
      initialProps: { need: false },
    });
    expect(h.toast).not.toHaveBeenCalled();

    rerender({ need: true });
    expect(h.toast).toHaveBeenCalledWith("A new version is available.", expect.anything());
  });

  it("holds the offer while a transaction is being made, then shows it", () => {
    h.mutating = 1;
    const { rerender } = renderHook(() => useUpdateOffer(true, reload));
    expect(h.toast).not.toHaveBeenCalled();

    h.mutating = 0;
    rerender();
    expect(h.toast).toHaveBeenCalledOnce();
  });

  it("takes the offer down when a transaction starts under it", () => {
    const { rerender } = renderHook(() => useUpdateOffer(true, reload));
    h.mutating = 1;
    rerender();
    expect(h.toast.dismiss).toHaveBeenCalledWith("toast-1");
  });
});
