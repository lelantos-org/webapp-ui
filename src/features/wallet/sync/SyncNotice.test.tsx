// @vitest-environment jsdom
// The sync-failure banner shows the user's line, not the raw fault.
//
// A failed `syncNotes` is usually an RPC or indexer error whose message is a
// hex payload or a wrapped JSON-RPC dump. That used to be appended to the
// banner verbatim.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SyncNotice } from "./SyncNotice";

const state = vi.hoisted(() => ({ error: null as unknown, isPending: false }));

vi.mock("./use-wallet-state", () => ({ useWalletState: () => state }));
vi.mock("./sync-progress-store", () => ({
  useSyncProgress: () => ({ active: false, scanned: 0, hits: 0 }),
}));

describe("SyncNotice", () => {
  it("does not append a raw RPC payload to the banner", () => {
    state.error = new Error(`eth_call returned undecodable data 0x${"ab".repeat(40)}`);
    render(<SyncNotice />);

    const banner = screen.getByText(/Balances could not be synced/);
    expect(banner.textContent).toContain("Something went wrong. Please try again.");
    expect(banner.textContent).not.toMatch(/0x[0-9a-f]{8,}/i);
  });

  it("keeps a short, readable cause", () => {
    state.error = new Error("Note discovery is unreachable");
    render(<SyncNotice />);

    expect(screen.getByText(/Balances could not be synced/).textContent).toContain(
      "Note discovery is unreachable",
    );
  });
});
