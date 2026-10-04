import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { jsonResponse, stubFetch } from "@/test/http";
import { renderQueryHook } from "@/test/render";
import { useSyncHead } from "./use-sync-head";

vi.mock("@/config/env", () => ({ env: { fmdUrl: "https://fmd.test/" } }));

vi.mock("@/features/chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/chain")>()),
  useActiveChain: () => ({ chainId: 31337n }),
}));

function respond(body: unknown, ok = true) {
  stubFetch(() => jsonResponse(body, { status: ok ? 200 : 500 }));
}

describe("useSyncHead", () => {
  it("collapses both watermarks into one comparable token", async () => {
    respond({ chainId: 31337, maxNoteId: 12, maxNullifierSeq: 4 });
    const { result } = renderQueryHook(() => useSyncHead());
    await waitFor(() => expect(result.current).toBe("12:4"));
  });

  it("distinguishes states that differ only in the nullifier watermark", async () => {
    respond({ chainId: 31337, maxNoteId: 12, maxNullifierSeq: 4 });
    const before = renderQueryHook(() => useSyncHead());
    await waitFor(() => expect(before.result.current).not.toBeNull());

    respond({ chainId: 31337, maxNoteId: 12, maxNullifierSeq: 5 });
    const after = renderQueryHook(() => useSyncHead());
    await waitFor(() => expect(after.result.current).not.toBeNull());

    expect(after.result.current).not.toBe(before.result.current);
  });

  it("reports null while the endpoint is failing", async () => {
    respond({}, false);
    const { result } = renderQueryHook(() => useSyncHead());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("requests the active chain with a single slash", async () => {
    respond({ chainId: 31337, maxNoteId: 1, maxNullifierSeq: 0 });
    const { result } = renderQueryHook(() => useSyncHead());
    await waitFor(() => expect(result.current).toBe("1:0"));
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://fmd.test/v1/head?chainId=31337");
  });
});
