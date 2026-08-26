import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryWrapper } from "@/test/harness";
import { useSyncHead } from "./use-sync-head";

vi.mock("@/config/env", () => ({ env: { fmdUrl: "https://fmd.test/" } }));

const chainId = vi.hoisted(() => ({ value: 31337n as bigint | undefined }));
vi.mock("@/features/chain/ChainProvider", () => ({
  useActiveChain: () => ({ chainId: chainId.value }),
}));

/// A real `Response`, not a duck-typed stand-in: the request now goes through
/// the SDK's HTTP client, which reads `status`, `headers` and the body stream
/// rather than just `ok`/`json()`.
function respond(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: ok ? 200 : 500,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

describe("useSyncHead", () => {
  beforeEach(() => {
    chainId.value = 31337n;
    vi.unstubAllGlobals();
  });

  it("collapses both watermarks into one comparable token", async () => {
    respond({ chainId: 31337, maxNoteId: 12, maxNullifierSeq: 4 });
    const { result } = renderHook(() => useSyncHead(), { wrapper: queryWrapper });
    await waitFor(() => expect(result.current).toBe("12:4"));
  });

  /// Both halves have to be in the token. Keyed on `maxNoteId` alone, a spend
  /// observed elsewhere — which moves only the nullifier sequence — would never
  /// invalidate the wallet, and the note would keep showing as spendable until
  /// the next unrelated arrival.
  it("distinguishes states that differ only in the nullifier watermark", async () => {
    respond({ chainId: 31337, maxNoteId: 12, maxNullifierSeq: 4 });
    const before = renderHook(() => useSyncHead(), { wrapper: queryWrapper });
    await waitFor(() => expect(before.result.current).not.toBeNull());

    // A second mount rather than a rerender: a rerender re-reads the cache and
    // would assert nothing about the response shape.
    respond({ chainId: 31337, maxNoteId: 12, maxNullifierSeq: 5 });
    const after = renderHook(() => useSyncHead(), { wrapper: queryWrapper });
    await waitFor(() => expect(after.result.current).not.toBeNull());

    expect(after.result.current).not.toBe(before.result.current);
  });

  /// `null`, not `"0:0"`. The consumer treats the first observed value as a
  /// baseline rather than a change, so a failure that read as a real watermark
  /// would make the very next successful poll look like new activity.
  it("reports null while the endpoint is failing", async () => {
    respond({}, false);
    const { result } = renderHook(() => useSyncHead(), { wrapper: queryWrapper });
    await waitFor(() => expect(result.current).toBeNull());
  });

  /// The SDK client builds the URL now, but the assertion stays: it pins the
  /// route, the chain scoping and the base-URL join, any of which an SDK bump
  /// could move without this module changing a line.
  it("requests the active chain with a single slash", async () => {
    respond({ chainId: 31337, maxNoteId: 1, maxNullifierSeq: 0 });
    const { result } = renderHook(() => useSyncHead(), { wrapper: queryWrapper });
    await waitFor(() => expect(result.current).toBe("1:0"));
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://fmd.test/v1/head?chainId=31337");
  });

  it("stays idle until a chain is selected", async () => {
    chainId.value = undefined;
    respond({ chainId: 31337, maxNoteId: 9, maxNullifierSeq: 9 });
    const { result } = renderHook(() => useSyncHead(), { wrapper: queryWrapper });
    await waitFor(() => expect(result.current).toBeNull());
    expect(fetch).not.toHaveBeenCalled();
  });
});
