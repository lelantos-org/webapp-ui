import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { renderQueryHook } from "@/test/render";
import { usePublishedAddress } from "./use-published-address";

describe("usePublishedAddress", () => {
  it("is the address the wallet publishes, not the one it hands out", async () => {
    const publishedAddress = vi.fn(async () => "lelantos1published");
    const wallet = fakeWalletApi({ address: SHIELDED_ADDRESS, publishedAddress });

    const { result } = renderQueryHook(() => usePublishedAddress(31337n, wallet));

    await waitFor(() => expect(result.current.data).toBe("lelantos1published"));
    expect(publishedAddress).toHaveBeenCalledOnce();
  });

  it("reports a wallet that could not derive it", async () => {
    const wallet = fakeWalletApi({
      address: SHIELDED_ADDRESS,
      publishedAddress: async () => {
        throw new Error("no keys");
      },
    });

    const { result } = renderQueryHook(() => usePublishedAddress(31337n, wallet));

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
