import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeEndpointsDialog, useEndpointsDialogOpen } from "@/shared/hooks/use-endpoints-dialog";
import { press } from "@/test/interact";
import { AccountMenu } from "./AccountMenu";

afterEach(() => {
  act(() => closeEndpointsDialog());
});

describe("AccountMenu", () => {
  it("opens the endpoint settings the folded header cannot show, and closes itself", () => {
    const dialog = renderHook(() => useEndpointsDialogOpen());
    render(<AccountMenu initials="AB" shown="0xab…cd" onCopy={vi.fn()} onDisconnect={vi.fn()} />);

    press("Account 0xab…cd");
    press("Network endpoints");

    expect(dialog.result.current).toBe(true);
    expect(screen.queryByRole("button", { name: "Network endpoints" })).not.toBeInTheDocument();
  });
});
