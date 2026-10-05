import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { hideAmounts } from "@/test/privacy";
import { Masked } from "./Masked";

describe("Masked", () => {
  it("shows the figure while privacy mode is off", () => {
    render(<Masked>1,204.50</Masked>);
    expect(screen.getByText("1,204.50")).toBeInTheDocument();
  });

  it("swaps a mounted figure for the mask when privacy mode turns on", () => {
    const { container } = render(<Masked>1,204.50</Masked>);
    hideAmounts();
    expect(container.textContent).not.toContain("1,204.50");
    expect(container).toHaveTextContent("••••");
  });

  it("masks every figure at the same width and tells a screen reader it is hidden", () => {
    hideAmounts();
    const { container } = render(
      <>
        <p>
          <Masked>7</Masked>
        </p>
        <p>
          <Masked>1,000,000.00</Masked>
        </p>
      </>,
    );
    const [small, large] = [...container.querySelectorAll("p")];
    expect(small?.textContent).toBe(large?.textContent);
    expect(screen.getAllByText("hidden")).toHaveLength(2);
  });
});
