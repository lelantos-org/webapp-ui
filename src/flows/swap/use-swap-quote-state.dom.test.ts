import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSwapQuoteState } from "./use-swap-quote-state";

const h = vi.hoisted(() => ({
  refetch: vi.fn(async () => ({})),
  stale: false,
  idle: false,
  visible: true,
}));

vi.mock("./use-swap-quote", () => ({
  useSwapQuote: () => ({
    data: { quotedAt: 0 },
    stale: false,
    isFetching: false,
    error: null,
    refetch: h.refetch,
  }),
}));
vi.mock("./use-quote-age", () => ({ useQuoteAge: () => ({ ageSecs: 31, stale: h.stale }) }));
vi.mock("./quote-request", () => ({ quoteRequest: () => ({}) }));
vi.mock("@/shared/lib/idle", () => ({ useIsIdle: () => h.idle }));
vi.mock("@/shared/hooks/use-page-visible", () => ({ usePageVisible: () => h.visible }));

const INPUT = {} as Parameters<typeof useSwapQuoteState>[0];

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(h, { stale: false, idle: false, visible: true });
});

describe("useSwapQuoteState", () => {
  it("re-prices an expired quote while someone is at the page", () => {
    const { rerender } = renderHook(() => useSwapQuoteState(INPUT));
    expect(h.refetch).not.toHaveBeenCalled();

    h.stale = true;
    rerender();
    expect(h.refetch).toHaveBeenCalledOnce();
  });

  it.each([
    ["the tab is hidden", { visible: false }],
    ["nobody has touched the page", { idle: true }],
  ])("waits while %s, then re-prices on their return", (_label, away) => {
    Object.assign(h, { stale: true }, away);
    const { rerender } = renderHook(() => useSwapQuoteState(INPUT));
    expect(h.refetch).not.toHaveBeenCalled();

    Object.assign(h, { idle: false, visible: true });
    rerender();
    expect(h.refetch).toHaveBeenCalledOnce();
  });
});
