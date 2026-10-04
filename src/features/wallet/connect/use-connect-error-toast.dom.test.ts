import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CANCELED_IN_WALLET } from "@/shared/lib/errors";
import { useConnectErrorToast } from "./use-connect-error-toast";

const h = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }));

vi.mock("@/shared/lib/toast", () => ({ toast: h }));

const NOT_FOUND = "No EVM wallet detected.";

describe("useConnectErrorToast", () => {
  it("stays quiet while nothing has failed", () => {
    renderHook(() => useConnectErrorToast(undefined));
    expect(h.error).not.toHaveBeenCalled();
    expect(h.warning).not.toHaveBeenCalled();
  });

  it("says why a connect failed, and again when a retry fails the same way", () => {
    const { rerender } = renderHook(({ error }) => useConnectErrorToast(error), {
      initialProps: { error: NOT_FOUND as string | undefined },
    });
    expect(h.error).toHaveBeenCalledWith("connection failed", { description: NOT_FOUND });

    rerender({ error: undefined });
    rerender({ error: NOT_FOUND });
    expect(h.error).toHaveBeenCalledTimes(2);
  });

  it("reports a dismissed prompt as a cancellation, not a failure", () => {
    renderHook(() => useConnectErrorToast(CANCELED_IN_WALLET));
    expect(h.warning).toHaveBeenCalledWith("connection canceled");
    expect(h.error).not.toHaveBeenCalled();
  });
});
