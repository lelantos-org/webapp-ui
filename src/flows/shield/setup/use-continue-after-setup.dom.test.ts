import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ContinueAfterSetupInputs, useContinueAfterSetup } from "./use-continue-after-setup";

const submit = vi.fn();
const base: ContinueAfterSetupInputs = {
  entered: "1|false|250",
  setupOpen: false,
  ready: false,
  submit,
};

const mount = (props: Partial<ContinueAfterSetupInputs> = {}) =>
  renderHook((p: ContinueAfterSetupInputs) => useContinueAfterSetup(p), {
    initialProps: { ...base, ...props },
  });

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("useContinueAfterSetup", () => {
  it("sends the deposit once the setup has closed and the form is ready", () => {
    const { result, rerender } = mount();
    act(() => result.current.arm());
    rerender({ ...base, setupOpen: true });
    expect(submit).not.toHaveBeenCalled();

    // The modal closes; the allowance read has not confirmed the setup yet.
    rerender({ ...base, setupOpen: false, ready: false });
    expect(submit).not.toHaveBeenCalled();

    rerender({ ...base, setupOpen: false, ready: true });
    expect(submit).toHaveBeenCalledOnce();

    // Once, not on every later render.
    rerender({ ...base, setupOpen: false, ready: true });
    expect(submit).toHaveBeenCalledOnce();
  });

  it("does nothing unless asked to", () => {
    const { rerender } = mount();
    rerender({ ...base, ready: true });
    expect(submit).not.toHaveBeenCalled();
  });

  it("calls the deposit off when the setup is cancelled", () => {
    const { result, rerender } = mount({ setupOpen: true });
    act(() => result.current.arm());
    act(() => result.current.disarm());
    rerender({ ...base, ready: true });
    expect(submit).not.toHaveBeenCalled();
  });

  it("calls it off when the form was edited meanwhile", () => {
    const { result, rerender } = mount();
    act(() => result.current.arm());
    rerender({ ...base, setupOpen: true });
    rerender({ ...base, entered: "1|false|300", ready: true });
    expect(submit).not.toHaveBeenCalled();
  });

  it("stops waiting if the setup is not confirmed soon after it closes", () => {
    vi.useFakeTimers();
    const { result, rerender } = mount();
    act(() => result.current.arm());
    act(() => vi.advanceTimersByTime(21_000));
    rerender({ ...base, ready: true });
    expect(submit).not.toHaveBeenCalled();
  });
});
