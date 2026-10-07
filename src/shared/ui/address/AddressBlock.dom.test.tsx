import { createEvent, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { hexAddress, SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { AddressBlock } from "./AddressBlock";

describe("AddressBlock", () => {
  it("shows the address in full with no character added between its groups", () => {
    const { container } = render(<AddressBlock value={SHIELDED_ADDRESS} />);
    expect(container.textContent).toBe(SHIELDED_ADDRESS);
  });

  it("numbers the rows of a long address, and not the two of an EVM one", () => {
    const { container, rerender } = render(<AddressBlock value={SHIELDED_ADDRESS} />);
    expect(container.querySelectorAll(".addr-block__row")).toHaveLength(8);
    expect(container.firstChild).toHaveClass("addr-block--numbered");

    rerender(<AddressBlock value={hexAddress("1a")} />);
    expect(container.querySelectorAll(".addr-block__row")).toHaveLength(2);
    expect(container.firstChild).toHaveClass("addr-block--plain");
  });

  it("tints the digits and nothing else", () => {
    const { container } = render(<AddressBlock value="lelantos1kyw2fth9" />);
    const tinted = [...container.querySelectorAll(".addr-block__num")].map((n) => n.textContent);
    expect(tinted).toEqual(["2", "9"]);
  });

  it("copies a selection without the breaks between rows", () => {
    const { container } = render(<AddressBlock value={SHIELDED_ADDRESS} />);
    const block = container.firstChild as HTMLElement;
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "lelantos1\nkywv 2fth\n",
    } as Selection);
    const setData = vi.fn();
    const copy = createEvent.copy(block, { clipboardData: { setData } });
    fireEvent(block, copy);
    expect(setData).toHaveBeenCalledWith("text/plain", "lelantos1kywv2fth");
    expect(copy.defaultPrevented).toBe(true);
    vi.restoreAllMocks();
  });
});
