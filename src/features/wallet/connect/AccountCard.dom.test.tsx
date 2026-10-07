import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { routerWrapper } from "@/test/render";
import { AccountCard } from "./AccountCard";

describe("AccountCard", () => {
  it("shows the shielded address as one string, with its request link and no fingerprint", () => {
    render(<AccountCard shielded={SHIELDED_ADDRESS} />, { wrapper: routerWrapper });
    const card = screen.getByRole("region", { name: "Your shielded address" });
    expect(screen.getByText(SHIELDED_ADDRESS)).toHaveAttribute("title", SHIELDED_ADDRESS);
    expect(within(card).queryByText("Fingerprint")).not.toBeInTheDocument();
    expect(within(card).queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Request a payment/ })).toHaveAttribute(
      "href",
      "/request",
    );
    expect(screen.queryByText("your public handle")).not.toBeInTheDocument();
  });

  it("names the account's handle, linking to its profile", () => {
    render(
      <AccountCard
        shielded={SHIELDED_ADDRESS}
        handle={{ name: "mehow.lelantos.xyz", to: "/profile#mehow" }}
      />,
      { wrapper: routerWrapper },
    );
    expect(screen.getByRole("link", { name: "mehow.lelantos.xyz" })).toHaveAttribute(
      "href",
      "/profile#mehow",
    );
    expect(screen.getByText("your public handle")).toBeInTheDocument();
  });
});
