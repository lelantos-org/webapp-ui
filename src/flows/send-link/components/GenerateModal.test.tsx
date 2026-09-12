// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { stepsFor } from "@/features/tx";
import { RunningScreen } from "./GenerateModal";

/// The three phases `GenerateLinkForm` shows while the link's transfer runs.
const STEPS = stepsFor("transfer").filter((s) =>
  ["preparing", "proving", "submitting"].includes(s.id),
);

describe("RunningScreen", () => {
  it("lists the steps in sentence case", () => {
    render(<RunningScreen amountLabel="25 USDC" steps={STEPS} activePhase="proving" />);

    const list = screen.getByRole("list", { name: "Transaction progress" });
    expect(list).toHaveTextContent("Pick the funds to spend");
    expect(list).toHaveTextContent("Build the zero-knowledge proof");
    expect(list).toHaveTextContent("Hand to the relayer");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Step 2 of 3: Build the zero-knowledge proof",
    );
    expect(screen.getByText("Do not close this tab.")).toBeInTheDocument();
  });
});
