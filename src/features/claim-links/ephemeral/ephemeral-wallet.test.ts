// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { summarizeEphemeralNotes } from "./ephemeral-wallet";

describe("summarizeEphemeralNotes", () => {
  it("totals the unspent notes per asset, in asset order", async () => {
    const notes = vi.fn(async () => [
      { asset: 3n, value: 5n },
      { asset: 1n, value: 2n },
      { asset: 3n, value: 7n },
    ]);
    const eph = fakeWalletApi({ notes });

    await expect(summarizeEphemeralNotes(eph)).resolves.toEqual([
      { asset: 1n, amount: 2n, notes: 1 },
      { asset: 3n, amount: 12n, notes: 2 },
    ]);
    // A spent note is already gone from the link; counting it would offer to
    // sweep funds that are not there.
    expect(notes).toHaveBeenCalledWith({ spent: false });
  });

  it("is empty for a link that holds nothing", async () => {
    await expect(
      summarizeEphemeralNotes(fakeWalletApi({ notes: async () => [] })),
    ).resolves.toEqual([]);
  });
});
