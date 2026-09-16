// @vitest-environment jsdom
// A step reads as a plan, an activity or a result depending on where the op is,
// and the live sentence names what is happening now, not the plan.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TxProgressCard } from "./TxProgressCard";

const STEPS = [
  {
    id: "preparing",
    label: "Pick the funds",
    activeLabel: "Picking the funds",
    doneLabel: "Picked the funds",
  },
  {
    id: "proving",
    label: "Build the proof",
    activeLabel: "Building the proof",
    doneLabel: "Built the proof",
    detail: "This is the slow part.",
  },
  { id: "submitting", label: "Hand to the relayer" },
];

describe("TxProgressCard", () => {
  it("labels each step by its state and explains only the current one", () => {
    render(<TxProgressCard title="Sending" steps={STEPS} current="proving" />);
    expect(screen.getByText("Picked the funds")).toBeInTheDocument();
    expect(screen.getByText("Building the proof")).toBeInTheDocument();
    expect(screen.getByText("Hand to the relayer")).toBeInTheDocument();
    expect(screen.getByText("This is the slow part.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Step 2 of 3: Building the proof");
  });

  it("falls back to the plain label where no other is given", () => {
    render(<TxProgressCard title="Sending" steps={STEPS} current="submitting" />);
    expect(screen.getByText("Hand to the relayer")).toBeInTheDocument();
    expect(screen.getByText("Built the proof")).toBeInTheDocument();
  });

  it("reads every step as done once the op is", () => {
    render(<TxProgressCard title="Sending" steps={STEPS} current="submitting" done />);
    expect(screen.getByText("Picked the funds")).toBeInTheDocument();
    expect(screen.queryByText("This is the slow part.")).not.toBeInTheDocument();
  });
});
