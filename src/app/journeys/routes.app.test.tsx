// Routing through the real shell: lazy screens, the connection gate and the fallback.

import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { bootApp, returningUser } from "@/test/boot";
import { press } from "@/test/interact";

describe("routes", () => {
  it("opens an action screen from a deep link once the wallet is back", async () => {
    returningUser();
    bootApp({ path: "/send" });

    expect(await screen.findByText("Send privately")).toBeInTheDocument();
    expect(screen.getByLabelText("You send")).toBeInTheDocument();
  });

  it("keeps an action screen behind the welcome screen until a wallet connects", async () => {
    bootApp({ path: "/send" });

    expect(await screen.findByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
    expect(screen.queryByText("Send privately")).not.toBeInTheDocument();
  });

  it("goes from the wallet to an action and loads its screen", async () => {
    returningUser();
    bootApp();
    await screen.findByText("Shielded balance");

    press(screen.getByRole("link", { name: "Unshield" }));

    await waitFor(() => expect(location.pathname).toBe("/unshield"));
    expect(await screen.findByLabelText("You unshield")).toBeInTheDocument();
  });

  it("answers an unknown address with a way back", async () => {
    bootApp({ path: "/nope" });

    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    press(screen.getByRole("link", { name: "Go to the wallet" }));
    expect(await screen.findByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  });
});
