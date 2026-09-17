import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stepper, type StepperItem } from "@/shared/ui/Stepper";

const STEPS: StepperItem[] = [
  { id: "submitting", label: "Sign transaction" },
  { id: "broadcast", label: "Pending deposit" },
  { id: "mined", label: "Deposit accepted" },
];

const announcement = () => screen.getByRole("status").textContent;

describe("Stepper", () => {
  it.each<[string, { current?: string; failed?: boolean; done?: boolean }, string]>([
    ["says nothing before a step has started", {}, ""],
    [
      "names the step in progress and where it falls",
      { current: "broadcast" },
      "Step 2 of 3: Pending deposit",
    ],
    [
      "announces the failure rather than leaving the last progress line up",
      { current: "broadcast", failed: true },
      "Step 2 of 3 failed: Pending deposit",
    ],
    [
      "reports a failure that arrived before any step did",
      { failed: true },
      "Step 1 of 3 failed: Sign transaction",
    ],
    [
      "announces completion on a terminal phase",
      { current: "mined", done: true },
      "Step 3 of 3 complete: Deposit accepted",
    ],
    ["stays quiet when a current step is not in the list", { current: "flushed" }, ""],
  ])("%s", (_label, props, expected) => {
    render(<Stepper steps={STEPS} {...props} />);
    expect(announcement()).toBe(expected);
  });

  it("renders nothing at all for an empty step list", () => {
    const { container } = render(<Stepper steps={[]} current="mined" />);

    expect(container).toBeEmptyDOMElement();
  });
});
