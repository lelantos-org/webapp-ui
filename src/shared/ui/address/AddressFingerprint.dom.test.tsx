import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { addressFingerprint } from "@/shared/lib/address-fingerprint";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { AddressFingerprint } from "./AddressFingerprint";

describe("AddressFingerprint", () => {
  it("shows the address's fingerprint as pictures, each named, with the names written out", () => {
    const marks = addressFingerprint(SHIELDED_ADDRESS);
    render(<AddressFingerprint value={SHIELDED_ADDRESS} />);
    const pictures = screen.getAllByRole("img");
    expect(pictures.map((p) => p.textContent)).toEqual(marks.map((mark) => mark.emoji));
    expect(pictures.map((p) => p.getAttribute("aria-label"))).toEqual(marks.map((m) => m.name));
    expect(screen.getByText("Fingerprint")).toBeInTheDocument();
    expect(screen.getByText(/^Penguin · Folder · Fire/)).toBeInTheDocument();
  });

  it("leaves the names to the pictures' labels when it is set on one line", () => {
    render(<AddressFingerprint inline value={SHIELDED_ADDRESS} />);
    expect(screen.getAllByRole("img")).toHaveLength(16);
    expect(screen.queryByText(/^Penguin · Folder/)).toBeNull();
  });
});
