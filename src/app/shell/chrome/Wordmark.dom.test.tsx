import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routerWrapper } from "@/test/render";
import { Wordmark } from "./Wordmark";

describe("Wordmark", () => {
  it("links back to the wallet's home", () => {
    render(<Wordmark />, { wrapper: routerWrapper });
    expect(screen.getByRole("link", { name: "Lelantos home" })).toHaveAttribute("href", "/");
  });

  it("stays a home link on the claim route", () => {
    render(<Wordmark sub="claim" />, { wrapper: routerWrapper });
    const link = screen.getByRole("link", { name: "Lelantos home" });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveTextContent("claim");
  });
});
