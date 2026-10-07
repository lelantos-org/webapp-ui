import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { addressFingerprint } from "@/shared/lib/address-fingerprint";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { AddressSummary } from "./AddressSummary";

const FINGERPRINT = addressFingerprint(SHIELDED_ADDRESS)
  .map((mark) => mark.emoji)
  .join("");

describe("AddressSummary", () => {
  it("shows the two ends of the address, and the whole of it on hover", () => {
    render(<AddressSummary value={SHIELDED_ADDRESS} />);
    expect(screen.getByTitle(SHIELDED_ADDRESS)).toHaveTextContent("lelantos1kywv 2fth … 2sha mv");
  });

  it("shows the fingerprint, and keeps the address itself closed until asked for", () => {
    const { container } = render(<AddressSummary value={SHIELDED_ADDRESS} />);
    expect(container).toHaveTextContent(FINGERPRINT);
    const full = screen.getByText("Show the full address").closest("details");
    expect(full).not.toHaveAttribute("open");
    expect(full).toHaveTextContent(SHIELDED_ADDRESS);
  });
});
