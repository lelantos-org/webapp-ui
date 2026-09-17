import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";

const releaseScanner = vi.fn();
vi.mock("./scanner", () => ({
  releaseScanner: (...a: unknown[]) => releaseScanner(...a),
}));

const { useScannerOwner } = await import("./use-scanner-owner");

const wallet = (id: string) => fakeWalletApi({ address: id });

describe("useScannerOwner", () => {
  it("releases what it holds on unmount", () => {
    const w = wallet("a");
    const { result, unmount } = renderHook(() => useScannerOwner());
    result.current.hold(w);

    unmount();

    expect(releaseScanner).toHaveBeenCalledExactlyOnceWith(w);
  });

  it("releases the previous wallet when a new one is held", () => {
    const first = wallet("a");
    const second = wallet("b");
    const { result } = renderHook(() => useScannerOwner());

    result.current.hold(first);
    result.current.hold(second);

    expect(releaseScanner).toHaveBeenCalledExactlyOnceWith(first);
  });

  it("holding the same wallet twice releases nothing", () => {
    const w = wallet("a");
    const { result } = renderHook(() => useScannerOwner());

    result.current.hold(w);
    result.current.hold(w);

    expect(releaseScanner).not.toHaveBeenCalled();
  });

  it("does not release twice across an explicit release and unmount", () => {
    const w = wallet("a");
    const { result, unmount } = renderHook(() => useScannerOwner());
    result.current.hold(w);

    result.current.release();
    unmount();

    expect(releaseScanner).toHaveBeenCalledExactlyOnceWith(w);
  });

  it("discards a wallet it never took", () => {
    const stray = wallet("stray");
    const { result } = renderHook(() => useScannerOwner());

    result.current.discard(stray);

    expect(releaseScanner).toHaveBeenCalledExactlyOnceWith(stray);
  });

  it("does not discard the wallet it is currently holding", () => {
    const w = wallet("a");
    const { result } = renderHook(() => useScannerOwner());
    result.current.hold(w);

    result.current.discard(w);

    expect(releaseScanner).not.toHaveBeenCalled();
  });

  it("unmounting with nothing held does nothing", () => {
    const { unmount } = renderHook(() => useScannerOwner());

    unmount();

    expect(releaseScanner).not.toHaveBeenCalled();
  });
});
