import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LinkOpState, useLinkStage } from "./use-link-stage";

const IDLE: LinkOpState = { pending: false, done: false };
const RUNNING: LinkOpState = { pending: true, done: false };
const DONE: LinkOpState = { pending: false, done: true };

const mount = (op: LinkOpState) =>
  renderHook((props: LinkOpState) => useLinkStage(props), { initialProps: op });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useLinkStage", () => {
  it("is the form with nothing under way", () => {
    expect(mount(IDLE).result.current).toMatchObject({ stage: "form", modalOpen: false });
  });

  it("walks a finished transfer through the tick and the close to its result", async () => {
    const h = mount(IDLE);
    h.rerender(RUNNING);
    expect(h.result.current).toMatchObject({ stage: "running", modalOpen: true });

    h.rerender(DONE);
    expect(h.result.current).toMatchObject({ stage: "success", modalOpen: true });

    await act(() => vi.advanceTimersByTimeAsync(1100));
    expect(h.result.current).toMatchObject({ stage: "closing", closing: true });

    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(h.result.current).toMatchObject({ stage: "result", modalOpen: false });
  });

  it("returns to the form when the transfer fails", () => {
    const h = mount(RUNNING);
    h.rerender(IDLE);
    expect(h.result.current.stage).toBe("form");
  });

  it("opens on the result of a transfer that finished while the screen was away", () => {
    expect(mount(DONE).result.current).toMatchObject({ stage: "result", modalOpen: false });
  });

  it("opens on the progress of a transfer still running", () => {
    expect(mount(RUNNING).result.current).toMatchObject({ stage: "running", modalOpen: true });
  });

  it("returns to the form once the result is dismissed, even mid-tick", async () => {
    const h = mount(RUNNING);
    h.rerender(DONE);
    h.rerender(IDLE);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(h.result.current.stage).toBe("form");
  });
});
