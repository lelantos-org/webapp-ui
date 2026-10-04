import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANCELED_IN_WALLET } from "@/shared/lib/errors";
import { toastError } from "./toast";

const h = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: h }));

const REJECTED = { code: 4001, message: "User rejected the request." };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("toastError", () => {
  it("titles a failure with what failed", () => {
    toastError("deposit failed", new Error("boom"));
    expect(h.error).toHaveBeenCalledWith("deposit failed", expect.anything());
    expect(h.warning).not.toHaveBeenCalled();
  });

  it("reports a wallet rejection as a cancellation, not a failure", () => {
    toastError("deposit failed", REJECTED);
    expect(h.warning).toHaveBeenCalledWith("deposit canceled", { description: CANCELED_IN_WALLET });
    expect(h.error).not.toHaveBeenCalled();
  });

  it("falls back to a bare title when the failure title has no verb to swap", () => {
    toastError("Couldn't clear spent notes", REJECTED);
    expect(h.warning).toHaveBeenCalledWith("Canceled", { description: CANCELED_IN_WALLET });
  });
});
