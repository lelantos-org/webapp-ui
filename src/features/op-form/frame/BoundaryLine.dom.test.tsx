import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoundaryLine } from "./BoundaryLine";

describe("BoundaryLine", () => {
  it("accents the end inside the pool", () => {
    render(<BoundaryLine from="Public wallet" to="Shielded pool" shielded="to" />);
    expect(screen.getByText("Shielded pool")).toHaveClass("accent");
    expect(screen.getByText("Public wallet")).not.toHaveClass("accent");
  });

  it("keeps the accent on the pool when value leaves it", () => {
    const { container } = render(
      <BoundaryLine from="Shielded pool" to="A public address" shielded="from" />,
    );
    expect(screen.getByText("Shielded pool")).toHaveClass("accent");
    expect(screen.getByText("A public address")).not.toHaveClass("accent");
    expect(container.querySelector(".boundary__arrow")).not.toHaveClass("boundary__arrow--in");
  });

  it("states a sentence for an op inside the pool, with the phone copy beside it", () => {
    render(
      <BoundaryLine
        sentence="Stays inside the shielded pool — nothing appears on-chain"
        short="Stays inside the pool"
      />,
    );
    expect(screen.getByText(/nothing appears on-chain/)).toBeInTheDocument();
    expect(screen.getByText("Stays inside the pool")).toBeInTheDocument();
  });
});
