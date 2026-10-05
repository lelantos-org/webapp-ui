import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { closeEndpointsDialog, useEndpointsDialogOpen } from "@/shared/hooks/use-endpoints-dialog";
import { chooseEndpoints } from "@/test/endpoints";
import { press } from "@/test/interact";
import { EndpointsButton } from "./EndpointsButton";

afterEach(() => {
  act(() => closeEndpointsDialog());
});

describe("EndpointsButton", () => {
  it("opens the endpoint settings", () => {
    const dialog = renderHook(() => useEndpointsDialogOpen());
    render(<EndpointsButton />);
    expect(dialog.result.current).toBe(false);

    press("network endpoints");
    expect(dialog.result.current).toBe(true);

    act(() => closeEndpointsDialog());
    expect(dialog.result.current).toBe(false);
  });

  it("is unmarked on the build's own services", () => {
    render(<EndpointsButton />);
    expect(screen.getByRole("button")).not.toHaveAttribute("data-marked");
  });

  it("is marked while a service is one the user chose", () => {
    chooseEndpoints({ relayerUrl: "https://relayer.example.com" });
    render(<EndpointsButton />);

    const button = screen.getByRole("button", { name: "network endpoints (custom in use)" });
    expect(button).toHaveAttribute("data-marked");
  });
});
