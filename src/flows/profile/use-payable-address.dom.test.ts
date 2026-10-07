import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePayableAddress } from "./use-payable-address";

const parseAddress = vi.fn(async (_address: string) => ({}));
vi.mock("@lelantos-org/sdk", () => ({ parseAddress: (a: string) => parseAddress(a) }));

beforeEach(() => {
  parseAddress.mockReset();
  parseAddress.mockResolvedValue({});
});

describe("usePayableAddress", () => {
  it("is undecided until the address has been decoded, then payable", async () => {
    const { result } = renderHook(() => usePayableAddress("lelantos1good"));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(true));
    expect(parseAddress).toHaveBeenCalledWith("lelantos1good");
  });

  it("is not payable when the address does not decode", async () => {
    parseAddress.mockRejectedValue(new Error("bad checksum"));
    const { result } = renderHook(() => usePayableAddress("lelantos1bad"));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("checks nothing without an address", () => {
    const { result } = renderHook(() => usePayableAddress(undefined));
    expect(result.current).toBeUndefined();
    expect(parseAddress).not.toHaveBeenCalled();
  });

  it("forgets the verdict of the address it was given before", async () => {
    const { result, rerender } = renderHook(({ a }) => usePayableAddress(a), {
      initialProps: { a: "lelantos1good" },
    });
    await waitFor(() => expect(result.current).toBe(true));
    parseAddress.mockRejectedValue(new Error("bad"));
    rerender({ a: "lelantos1other" });
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(false));
  });
});
