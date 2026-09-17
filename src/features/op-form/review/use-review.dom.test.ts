import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReview } from "./use-review";

describe("useReview", () => {
  const reviewing = (fp = "100-to-alice") => {
    const view = renderHook((props) => useReview(props.fp), { initialProps: { fp } });
    act(() => view.result.current.enter());
    return view;
  };

  it("starts closed, opens on enter and closes on cancel", () => {
    const { result } = renderHook(() => useReview("a"));
    expect(result.current.open).toBe(false);
    act(() => result.current.enter());
    expect(result.current.open).toBe(true);
    act(() => result.current.cancel());
    expect(result.current.open).toBe(false);
  });

  it("drops out of review when the spend changes underneath it", () => {
    const { result, rerender } = reviewing();
    rerender({ fp: "100-to-bob" });
    expect(result.current.open).toBe(false);
  });

  it("stays open when nothing changed", () => {
    const { result, rerender } = reviewing();
    rerender({ fp: "100-to-alice" });
    expect(result.current.open).toBe(true);
  });

  it("closes in the render that sees the change, so no commit shows stale figures", () => {
    const opens: boolean[] = [];
    const { result, rerender } = renderHook(
      ({ fp }) => {
        const review = useReview(fp);
        opens.push(review.open);
        return review;
      },
      { initialProps: { fp: "100-to-alice" } },
    );
    act(() => result.current.enter());
    opens.length = 0;
    rerender({ fp: "100-to-bob" });
    expect(opens.every((o) => !o)).toBe(true);
  });

  it("stays closed when an edit returns to the reviewed values", () => {
    const { result, rerender } = reviewing();
    rerender({ fp: "100-to-bob" });
    rerender({ fp: "100-to-alice" });
    expect(result.current.open).toBe(false);
  });
});
