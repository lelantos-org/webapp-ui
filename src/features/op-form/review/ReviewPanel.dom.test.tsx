import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewPanel, type ReviewPanelProps } from "./ReviewPanel";

const props: ReviewPanelProps = {
  figure: "250.00",
  symbol: "USDC",
  words: "Two hundred fifty and 00/100 USDC",
  destinationLabel: "To this shielded address",
  destination: "lelantos1abc",
  destinationNote: "Stays off-chain.",
  fees: <p>Relayer fee 0.10 USDC</p>,
  warning: "This cannot be reversed.",
  confirmLabel: "Confirm and send",
  busy: false,
  onCancel: () => {},
};

describe("ReviewPanel", () => {
  it("says what a merge adds, beside the fees it adds to", () => {
    render(<ReviewPanel {...props} mergeFirst />);
    const fees = screen.getByRole("region", { name: "Fees" });
    expect(fees).toHaveTextContent("Relayer fee 0.10 USDC");
    expect(fees).toHaveTextContent(/one more relayer fee.*one extra proof/);
  });

  it("says nothing of a merge when there is none", () => {
    render(<ReviewPanel {...props} />);
    expect(screen.queryByText(/combined first/)).not.toBeInTheDocument();
  });

  it("shows the memo as the text it is, and no section without one", () => {
    const { rerender } = render(<ReviewPanel {...props} />);
    expect(screen.queryByRole("region", { name: "Memo" })).not.toBeInTheDocument();

    const memo = '<a href="https://evil.example">rent</a>';
    rerender(<ReviewPanel {...props} memo={memo} memoNote="Only the recipient can read it." />);
    const section = screen.getByRole("region", { name: "Memo" });
    expect(section).toHaveTextContent(memo);
    expect(section.querySelector("a")).toBeNull();
    expect(section).toHaveTextContent(/Only the recipient can read it/);
  });

  it("holds the confirm and says why", () => {
    render(<ReviewPanel {...props} confirmBlocked="Working out the fee…" />);
    expect(screen.getByRole("button", { name: "Confirm and send" })).toBeDisabled();
    expect(screen.getByText("Working out the fee…")).toBeInTheDocument();
  });
});
